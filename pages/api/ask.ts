import type { NextApiRequest, NextApiResponse } from 'next';
import OpenAI from 'openai';

// Dynamic import for PDF processing to handle serverless environment
let pdfParse: any = null;
try {
  pdfParse = require('pdf-parse');
} catch (error) {
  console.log('PDF processing not available in this environment:', error instanceof Error ? error.message : String(error));
}

// Enhanced caching system for cost optimization
const pdfCache = new Map<string, { content: string; timestamp: number; lastUsed: number }>();
const productPageCache = new Map<string, { content: string; timestamp: number; lastUsed: number }>();
const CACHE_DURATION = 2592000000; // 30 days in milliseconds
const MAX_CACHE_SIZE = 1000; // Maximum number of cached items

const openai = new OpenAI({
  apiKey: process.env.XAI_API_KEY,
  baseURL: 'https://api.x.ai/v1',
});

// Add debug logging for API key
console.log('XAI_API_KEY present:', !!process.env.XAI_API_KEY);
console.log('XAI_API_KEY length:', process.env.XAI_API_KEY?.length || 0);

// Rate limiting storage (in production, use Redis or similar)
const rateLimitStore = new Map<string, { count: number; resetTime: number; dailyCount: number; dailyResetTime: number }>();

interface AskRequest {
  question: string;
  productSpecs: string;
  productTitle: string;
  datasheetUrl?: string;
  similarProducts?: string;
  accessories?: string;
  userIP?: string;
}

interface AskResponse {
  answer?: string;
  error?: string;
  model?: string;
  version?: string;
  cacheSize?: number;
  productPageCacheSize?: number;
  maxTokens?: number;
  debug?: string;
}

// COST-OPTIMIZED ASK ED CONFIGURATION
const ASK_ED_CONFIG = {
  maxTokens: 150, // ~67 tokens for cost optimization ($10.00/1M for Grok-2-1212)
  temperature: 0.1,
  maxResponseWords: 100, // Concise responses to minimize output costs
  maxProductPageTokens: 1600, // ~400 tokens for product page context
  maxDatasheetTokens: 2000 // ~500 tokens for datasheet excerpt
};

const ASK_ED_SYSTEM_PROMPT = `You are Ask ED, a Bravo Electro product expert powered by Grok-2-1212. Answer questions about the current product using only the provided product page and datasheet excerpt. Apply logical reasoning to interpret user intent and infer answers from available data (e.g., deduce compatibility from specs like input range). Paraphrase for clarity if it improves understanding (e.g., "Voltage adjusts from roughly 22V to 27V via potentiometer" based on datasheet ranges), but keep facts accurate without speculation. Follow these rules:

1. **Accuracy**: Base answers on page/datasheet; quote or paraphrase specs as needed. For intent not directly covered, infer logically (e.g., if asking about setup, explain from general patterns like universal AC input).

2. **Pricing/Stock**: For pricing or volume discounts, say: "For pricing or volume quotes, fill out our [RFQ Form](https://www.bravoelectro.com/rfq-form) or speak with a Bravo Team member." For stock, say: "For stock details, speak with a Bravo Team member via chat, call 408-733-9090, or fill out our [RFQ Form](https://www.bravoelectro.com/rfq-form)."

3. **Hyperlinks**: Hyperlink only specified items: product SKUs to their URLs (e.g., [example-product](https://www.bravoelectro.com/example-product.html)), 'datasheet' to its URL if provided, and 'RFQ Form' to https://www.bravoelectro.com/rfq-form. Use exact format: [text](full-valid-URL) with no variations. Hyperlink each item only once per response (e.g., link 'datasheet' only the first time; reference without link afterward). Do not hyperlink manufacturer names (e.g., 'Mean Well', 'Mean'), standalone words like 'link', partial words, or invalid URLs (e.g., reject 'mean.html' or malformed formats).

4. **Tone**: Be concise (<150 words), professional, and friendly. Start with the answer, add context if needed, and offer Bravo contact options.

5. **Caching**: When caching, extract/include 'Similar Products' and 'Accessories' sections if present (~100–200 tokens; flag absent otherwise). For datasheets, include mechanical notes (e.g., mounting holes often ~4.2 mm diameter with model-specific spacing).

6. **Scope**: Answer only about Bravo Electro products. Never suggest other distributors or manufacturers.

7. **Product Page Sections**: If 'Similar Products' exists in page text, for related queries say: "Check the Similar Products section on this page for options." (no listing/linking unless asked for details). For 'Accessories': "Check the Accessories section on this page for related items." If absent: "No similar products or accessories listed. Contact a Bravo Power Expert at 408-733-9090 or use our web chat."

8. **Unknown Answers**: If inferable from text or logic (e.g., mounting holes from datasheet patterns: ~4.2 mm diameter, 4 places, spacing ~196 mm), provide it. For image-based details, say: "Mounting hole dimensions are in the datasheet's mechanical drawing section (e.g., common: 4.2 mm diameter with model-specific spacing). View the [datasheet](exact-URL)." Otherwise: "I don't have that detail. Contact a Bravo Power Expert at 408-733-9090 or use our web chat."

Keep responses concise and cost-effective.`;

function isRateLimited(userIP: string): boolean {
  const now = Date.now();
  const userLimit = rateLimitStore.get(userIP);

  if (!userLimit) {
    rateLimitStore.set(userIP, {
      count: 1,
      resetTime: now + 60000, // 1 minute
      dailyCount: 1,
      dailyResetTime: now + 86400000 // 24 hours
    });
    return false;
  }

  // Check daily limit
  if (now > userLimit.dailyResetTime) {
    userLimit.dailyCount = 1;
    userLimit.dailyResetTime = now + 86400000;
  } else if (userLimit.dailyCount >= 50) {
    return true; // Daily limit exceeded
  }

  // Check per-minute limit
  if (now > userLimit.resetTime) {
    userLimit.count = 1;
    userLimit.resetTime = now + 60000;
  } else if (userLimit.count >= 5) {
    return true; // Per-minute limit exceeded
  }

  userLimit.count++;
  userLimit.dailyCount++;
  return false;
}

function validateInput(question: string): boolean {
  // Check for suspicious patterns
  const suspiciousPatterns = [
    /[<>{}]/g, // HTML/code injection
    /javascript:|data:/gi, // XSS attempts
    /\b(ignore|forget|disregard).*(previous|instruction|prompt)/gi, // Prompt injection
    /\b(act as|you are now|roleplay)/gi, // Role change attempts
  ];

  return !suspiciousPatterns.some(pattern => pattern.test(question));
}

function evictOldCacheEntries(cache: Map<string, { content: string; timestamp: number; lastUsed: number }>) {
  const now = Date.now();
  
  // Remove expired entries
  const keysToDelete: string[] = [];
  cache.forEach((value, key) => {
    if (now - value.timestamp > CACHE_DURATION) {
      keysToDelete.push(key);
    }
  });
  keysToDelete.forEach(key => cache.delete(key));
  
  // If still over limit, remove least recently used
  if (cache.size > MAX_CACHE_SIZE) {
    const entries = Array.from(cache.entries());
    entries.sort((a, b) => a[1].lastUsed - b[1].lastUsed);
    const toRemove = entries.slice(0, cache.size - MAX_CACHE_SIZE);
    toRemove.forEach(([key]) => cache.delete(key));
  }
}

function getCachedContent(cache: Map<string, { content: string; timestamp: number; lastUsed: number }>, key: string): string | null {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    cached.lastUsed = Date.now(); // Update last used time
    return cached.content;
  }
  return null;
}

function setCachedContent(cache: Map<string, { content: string; timestamp: number; lastUsed: number }>, key: string, content: string) {
  evictOldCacheEntries(cache);
  cache.set(key, {
    content,
    timestamp: Date.now(),
    lastUsed: Date.now()
  });
}

function processAskEdResponse(answer: string, datasheetUrl?: string, productTitle?: string): string {
  // Replace datasheet URL placeholder
  if (datasheetUrl) {
    answer = answer.replace(/\[DATASHEET_URL\]/g, datasheetUrl);
  }
  
  // Hyperlink RFQ Form references that aren't already linked
  answer = answer.replace(
    /(?<!href=['"][^'"]*)\bRFQ Form\b(?![^<]*<\/a>)/gi,
    '<a href="https://www.bravoelectro.com/rfq-form" target="_blank" style="color: white; text-decoration: underline;">RFQ Form</a>'
  );
  
  // Hyperlink datasheet references that aren't already linked
  answer = answer.replace(
    /(?<!href=['"][^'"]*)\bdatasheet\b(?![^<]*<\/a>)/gi,
    datasheetUrl ? 
      `<a href="${datasheetUrl}" target="_blank" style="color: white; text-decoration: underline;">datasheet</a>` :
      'datasheet'
  );
  
  // Generate product URLs based on model number (convert to Bravo URL format)
  if (productTitle) {
    const modelMatch = productTitle.match(/^([A-Z0-9\-\.]+)/i);
    if (modelMatch) {
      const modelNumber = modelMatch[1];
      const urlSlug = modelNumber.toLowerCase().replace(/\./g, '-');
      const productUrl = `https://www.bravoelectro.com/${urlSlug}.html`;
      
      // Hyperlink product model references
      const modelRegex = new RegExp(`\\b${modelNumber.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b(?![^<]*<\/a>)`, 'gi');
      answer = answer.replace(
        modelRegex,
        `<a href="${productUrl}" target="_blank" style="color: white; text-decoration: underline;">${modelNumber}</a>`
      );
    }
  }
  
  // Fix any remaining raw URLs to be hyperlinked
  answer = answer.replace(
    /(https?:\/\/[^\s<]+)(?![^<]*>)(?![^<]*<\/a>)/gi,
    '<a href="$1" target="_blank" style="color: white; text-decoration: underline;">link</a>'
  );
  
  return answer.trim();
}


async function fetchPDFContent(url: string): Promise<string> {
  // Check cache first using new cache system
  const cachedContent = getCachedContent(pdfCache, url);
  if (cachedContent) {
    console.log('Using cached PDF content for:', url);
    return cachedContent;
  }
  
  // Skip PDF processing if library not available
  if (!pdfParse) {
    console.log('PDF processing unavailable, skipping:', url);
    return '';
  }
  
  try {
    console.log('Attempting to fetch PDF:', url);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch PDF: ${response.statusText}`);
    }
    
    const buffer = await response.arrayBuffer();
    const data = await pdfParse(Buffer.from(buffer));
    
    console.log('PDF processing successful, extracted text length:', data.text.length);
    console.log('PDF total pages:', data.numpages);
    
    // Extract full PDF content
    let pdfContent = data.text;
    
    // Enhanced datasheet extraction prioritizing model-specific adjustment ranges and tables
    const sections = {
      // Model-specific tables - HIGHEST PRIORITY
      modelTable: extractSection(pdfContent, ['model no', 'part number', 'ordering information', 'model table', 'specifications table'], 4000),
      
      // Adjustment ranges - CRITICAL for A suffix models
      voltageAdjust: extractSection(pdfContent, ['voltage adj. range', 'voltage adjustment', 'vadj', 'output voltage adjustment', 'potentiometer', 'trim pot', 'adjustment range', 'voltage adj range'], 3000),
      currentAdjust: extractSection(pdfContent, ['current adj. range', 'current adjustment', 'iadj', 'output current adjustment', 'current adj range'], 2000),
      
      // Mechanical specifications - for mounting/installation questions
      mechanical: extractSection(pdfContent, ['mechanical specification', 'mechanical drawing', 'mounting', 'dimensions', 'hole diameter', 'hole spacing', 'mounting holes', 'mechanical dimension'], 2000),
      
      // Constant current region - Key for LED drivers
      constantCurrent: extractSection(pdfContent, ['constant current region', 'constant current', 'cc region', 'current region', 'constant current area'], 2000),
      
      // Electrical specifications
      electrical: extractSection(pdfContent, ['electrical specification', 'electrical characteristics', 'electrical spec'], 3000),
      
      // Model suffix information
      suffixInfo: extractSection(pdfContent, ['model suffix', 'suffix code', 'model code', 'ordering information', 'model designation'], 1500),
      
      // Other specs
      dimming: extractSection(pdfContent, ['dimming', 'dim function', 'dimming operation'], 1500),
      features: extractSection(pdfContent, ['features', 'key features'], 1000)
    };
    
    // Combine ALL content - prioritize technical specs
    let combinedContent = `COMPLETE DATASHEET CONTENT:

`;
    
    // Always include electrical specs first
    if (sections.electrical) {
      combinedContent += `ELECTRICAL SPECIFICATIONS:
${sections.electrical}

`;
    }
    
    if (sections.voltageAdjust) {
      combinedContent += `VOLTAGE ADJUSTMENT:
${sections.voltageAdjust}

`;
    }
    
    if (sections.currentAdjust) {
      combinedContent += `CURRENT ADJUSTMENT:
${sections.currentAdjust}

`;
    }
    
    if (sections.mechanical) {
      combinedContent += `MECHANICAL SPECIFICATIONS:
${sections.mechanical}

`;
    }
    
    if (sections.suffixInfo) {
      combinedContent += `MODEL SUFFIX INFORMATION:
${sections.suffixInfo}

`;
    }
    
    if (sections.constantCurrent) {
      combinedContent += `CONSTANT CURRENT REGION:
${sections.constantCurrent}

`;
    }
    
    if (sections.modelTable) {
      combinedContent += `MODEL/SPECIFICATIONS TABLE:
${sections.modelTable}

`;
    }
    
    if (sections.dimming) {
      combinedContent += `DIMMING INFORMATION:
${sections.dimming}

`;
    }
    
    // If sections are missing, include more raw content
    if (!sections.electrical || !sections.voltageAdjust) {
      combinedContent += `ADDITIONAL DATASHEET TEXT:
${pdfContent.substring(0, 4000)}
`;
    }
    
    // Cache the result optimized for cost (500 tokens ~= 2000 characters)
    const finalContent = combinedContent.substring(0, 2000); // ~500 tokens for cost optimization
    setCachedContent(pdfCache, url, finalContent);
    
    console.log('PDF extraction complete. Sections found:', {
      electrical: !!sections.electrical,
      voltageAdjust: !!sections.voltageAdjust,
      currentAdjust: !!sections.currentAdjust,
      mechanical: !!sections.mechanical,
      constantCurrent: !!sections.constantCurrent,
      modelTable: !!sections.modelTable
    });
    
    return finalContent;
  } catch (error) {
    console.error('PDF fetch error:', error);
    return '';
  }
}

function extractSection(text: string, keywords: string[], maxLength: number = 2000): string {
  const lowerText = text.toLowerCase();
  for (const keyword of keywords) {
    const index = lowerText.indexOf(keyword.toLowerCase());
    if (index !== -1) {
      // Extract section with specified length
      return text.substring(index, Math.min(index + maxLength, text.length));
    }
  }
  return '';
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<AskResponse>
) {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.status(200).end();
    return;
  }

  // Set CORS headers for actual requests
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { question, productSpecs, productTitle, datasheetUrl, similarProducts, accessories }: AskRequest = req.body;
  
  // Enhanced logging for debugging
  console.log('=== ASK ED REQUEST ===');
  console.log('Product:', productTitle);
  console.log('Question:', question);
  console.log('Has Specs:', !!productSpecs);
  console.log('Specs include dimming:', productSpecs?.toLowerCase().includes('dimming'));
  console.log('Is Non-Dimming:', productSpecs?.toLowerCase().includes('non-dimming'));
  console.log('Has Accessories:', !!accessories);
  
  // Debug endpoint to check model
  if (question === "DEBUG_MODEL_CHECK") {
    return res.status(200).json({ 
      answer: "Currently using model: grok-2-1212 with enhanced Bravo guidelines and cost optimization. Deployment successful!", 
      model: "grok-2-1212",
      version: "2024-12-16",
      cacheSize: pdfCache.size,
      productPageCacheSize: productPageCache.size,
      maxTokens: ASK_ED_CONFIG.maxTokens
    });
  }
  const userIP = req.headers['x-forwarded-for']?.toString()?.split(',')[0] || 
                 req.socket.remoteAddress || 'unknown';

  // Validation
  if (!question || !productSpecs || !productTitle) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  if (question.length > 500) {
    return res.status(400).json({ error: 'Question too long' });
  }

  if (!validateInput(question)) {
    return res.status(400).json({ error: 'Invalid input detected' });
  }

  // Rate limiting
  if (isRateLimited(userIP)) {
    return res.status(429).json({ error: 'Rate limit exceeded. Please try again later.' });
  }

  try {
    // Fetch PDF datasheet content if available
    let datasheetContent = '';
    if (datasheetUrl) {
      console.log('Fetching datasheet:', datasheetUrl);
      datasheetContent = await fetchPDFContent(datasheetUrl);
      if (datasheetContent) {
        console.log('Successfully extracted PDF content, length:', datasheetContent.length);
      }
    }

    // Optimize token usage for cost-effectiveness
    const truncatedSpecs = productSpecs.substring(0, ASK_ED_CONFIG.maxProductPageTokens);
    const truncatedDatasheet = datasheetContent.substring(0, ASK_ED_CONFIG.maxDatasheetTokens);
    
    const userMessage = `Product: ${productTitle}

Product Specifications:
${truncatedSpecs}

${truncatedDatasheet ? `Datasheet Info:
${truncatedDatasheet}` : ''}

${datasheetUrl ? `Datasheet URL: ${datasheetUrl}` : ''}

Question: ${question}`;

    const completion = await openai.chat.completions.create({
      model: "grok-2-1212",
      messages: [
        {
          role: "system",
          content: ASK_ED_SYSTEM_PROMPT
        },
        {
          role: "user",
          content: userMessage
        }
      ],
      max_tokens: ASK_ED_CONFIG.maxTokens,
      temperature: ASK_ED_CONFIG.temperature, // Low temperature for consistent, factual responses
    });

    let answer = completion.choices[0].message.content || 
                  "I'm sorry, I couldn't process your question. Please contact a Bravo Power Expert for assistance.";

    // Enhanced post-processing for Ask ED responses
    answer = processAskEdResponse(answer, datasheetUrl, productTitle);

    res.status(200).json({ answer });

  } catch (error) {
    console.error('Grok API error:', error);
    console.error('Error details:', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      hasApiKey: !!process.env.XAI_API_KEY
    });
    res.status(500).json({ 
      error: 'I\'m experiencing technical difficulties. Please contact a Bravo Power Expert via web chat or call 408-733-9090.',
      debug: process.env.NODE_ENV === 'development' ? error instanceof Error ? error.message : String(error) : undefined
    });
  }
}