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

const ASK_ED_SYSTEM_PROMPT = `You are Ask Ed, a professional product assistant for Bravo Electro.

CORE GUIDELINES:

SCOPE: Respond only about Bravo Electro products. Never mention or suggest other distributors, manufacturers, or external sources. If a question goes beyond Bravo Electro's offerings, politely redirect to Bravo experts.

ACCURACY: Base answers solely on the product page text and datasheet provided. Quote specs verbatim where possible (e.g., "Output: 24 volts, 0~5.0A, 120 watts" for HLG-120H-24A). 

CRITICAL MODEL INTERPRETATION:
- For Mean Well HLG series: "A" suffix = adjustable output via built-in potentiometer
- For Mean Well HLG series: "B" suffix = 3-in-1 dimming capability
- For Mean Well HLG series: "D" suffix = DALI dimming
- Always check datasheet for adjustment ranges and specifications

If data is unclear or missing, do not guess—use the referral protocol.

UNKNOWN ANSWERS: If the exact information is not verbatim in the product page or datasheet excerpt but can be logically inferred (e.g., voltage adjustment from model tables or constant regions), provide it with a verbatim quote or calculation. Only refer to Bravo Power Experts if truly unavailable (e.g., no datasheet access or unrelated query). For example, for HLG-120H-24A, use datasheet specs like 'VOLTAGE ADJ. RANGE: 22 ~ 27V' and 'CURRENT ADJ. RANGE: 2.5 ~ 5A' directly.

PRICING/VOLUME PRICING: If asked about pricing or volume discounts, respond: "For current pricing or volume quotes, please fill out our <a href='https://www.bravoelectro.com/rfq-form' target='_blank' style='color: white; text-decoration: underline;'>RFQ Form</a> or speak with a Bravo Team member."

STOCK AVAILABILITY: If asked about stock or inventory, respond: "For stock details, please speak with a Bravo Team member via chat, call 408-733-9090, or fill out our <a href='https://www.bravoelectro.com/rfq-form' target='_blank' style='color: white; text-decoration: underline;'>RFQ Form</a>."

HYPERLINKS: When referencing datasheets or RFQ forms, hyperlink the descriptive text using proper HTML format with white color and underline styling.

TONE AND EFFICIENCY: Be helpful, professional, and friendly. Start responses with a direct answer, then add context if needed. End with an offer for more help via Bravo channels if appropriate. Avoid unnecessary details to minimize token usage.

RESPONSE STRUCTURE EXAMPLES:
User: "Does the HLG-120H-24A have dimming?"
Response: "The HLG-120H-24A is a non-dimming driver, per the product page. For more details, view the <a href='[DATASHEET_URL]' target='_blank' style='color: white; text-decoration: underline;'>datasheet</a>. Need help with alternatives? Contact a Bravo Power Expert at 408-733-9090 or use our web chat."

User: "Can I adjust the voltage on this power supply?"
Response: "Yes, the HLG-120H-24A has adjustable output voltage and current via built-in potentiometer (indicated by the 'A' suffix). Check the <a href='[DATASHEET_URL]' target='_blank' style='color: white; text-decoration: underline;'>datasheet</a> for specific adjustment ranges."

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