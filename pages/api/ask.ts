import type { NextApiRequest, NextApiResponse } from 'next';
import OpenAI from 'openai';

// Dynamic import for PDF processing to handle serverless environment
let pdfParse: any = null;
try {
  pdfParse = require('pdf-parse');
} catch (error) {
  console.log('PDF processing not available in this environment:', error instanceof Error ? error.message : String(error));
}

// In-memory cache for PDF and product data (consider Redis for production)
const pdfCache = new Map<string, { content: string; timestamp: number }>();
const CACHE_DURATION = 3600000; // 1 hour in milliseconds

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
  debug?: string;
}

// Ask ED Configuration - Easy to modify behavior
const ASK_ED_CONFIG = {
  // Core behavior settings
  maxTokens: 300,
  temperature: 0.1,
  maxResponseWords: 200,
  
  // LED Driver Terminology Guide - WHERE TO FIND SPECIFIC INFO
  ledDriverTerminology: {
    'dimming': {
      primarySource: 'Product page Specifications section - look for "Dimming" field',
      values: ['Non-Dimming', '3-in-1 Dimming', '0-10V Dimming', 'DALI', 'PWM'],
      secondarySource: 'If dimming exists, check datasheet for dimming curves and details'
    },
    'constant current range': {
      primarySource: 'Datasheet - look for "Constant Current Region" section',
      note: 'Check the appropriate model row/column in the datasheet table'
    },
    'IP rating': {
      primarySource: 'Product page Specifications - look for "IP Rating" or "Ingress Protection"',
      secondarySource: 'Datasheet for detailed environmental specifications'
    },
    'efficiency': {
      primarySource: 'Product page Specifications - may show typical efficiency %',
      secondarySource: 'Datasheet for efficiency curves at different loads'
    },
    'PFC': {
      primarySource: 'Product page Specifications - look for "Power Factor" or "PF"',
      secondarySource: 'Datasheet for PFC values at different loads'
    },
    'THD': {
      primarySource: 'Datasheet - Total Harmonic Distortion specifications',
      note: 'Usually not on product page, check datasheet'
    },
    'inrush current': {
      primarySource: 'Datasheet - look for "Inrush Current" or "Surge Current" specifications',
      note: 'Critical for circuit breaker sizing'
    },
    'MTBF': {
      primarySource: 'Product page Specifications or Features section',
      secondarySource: 'Datasheet for detailed reliability data and conditions'
    },
    'flicker': {
      primarySource: 'Datasheet - look for "Ripple & Noise" or "Output Ripple" specifications',
      note: 'Lower ripple = less flicker'
    },
    'warranty': {
      primarySource: 'Product page - usually in Features or Description section',
      note: 'Typically 5-7 years for Mean Well LED drivers'
    }
  },
  
  // Response format templates
  templates: {
    missingSpec: "I don't see [REQUESTED_SPEC] in my database for this product. Please check the <a href='[DATASHEET_URL]' target='_blank' style='color: white; text-decoration: underline;'>datasheet</a> for complete details.",
    similarProducts: "Check the 'Similar Products' section on this product page for Bravo alternatives.",
    accessories: "Check the 'Accessories' section on this product page for compatible connectors and add-ons. If you don't see what you need, contact our Bravo Power Experts.",
    accessoriesNotAvailable: "Contact our Bravo Power Experts at 408-733-9090 for compatible connector and accessory options.",
    alternativeProducts: "Contact our Bravo Power Experts at 408-733-9090 for product recommendations.",
    dimensions: "For specific mounting hole details, check the <a href='[DATASHEET_URL]' target='_blank' style='color: white; text-decoration: underline;'>datasheet</a>",
    technicalCurves: "Detailed curve information requires reviewing the <a href='[DATASHEET_URL]' target='_blank' style='color: white; text-decoration: underline;'>datasheet</a> graphs.",
    ledDriverSpecs: "Check the <a href='[DATASHEET_URL]' target='_blank' style='color: white; text-decoration: underline;'>datasheet</a> for detailed [TERM] specifications.",
    nonProductQuestions: "I can answer questions about [PRODUCT_NAME]. For other topics, contact the Bravo Team at 408-733-9090.",
    pricing: "Contact our team at 408-733-9090 or fill out our <a href='https://www.bravoelectro.com/rfq-form' target='_blank' style='color: white; text-decoration: underline;'>RFQ Form</a>.",
    stock: "Contact the Bravo Team for stock information at 408-733-9090 during business hours (M-F 8am-5pm PST).",
    expertConsultation: "Consult our Bravo Power Experts for detailed guidance."
  },
  
  // Language standardization rules
  languageRules: {
    forbiddenPhrases: [
      'provided product specifications',
      'detailed datasheet', 
      'product specifications or detailed datasheet',
      'not explicitly provided',
      'doesn\'t explicitly provide',
      'not explicitly stated',
      'thinking',
      'loading', 
      'processing'
    ],
    replacements: {
      'my database': ['provided product specifications', 'detailed datasheet', 'product specifications or detailed datasheet'],
      'I don\'t see this information': ['not explicitly provided', 'doesn\'t explicitly provide', 'not explicitly stated'],
      'datasheet': ['product manual', 'specification sheet', 'spec sheet'],
      'checking my database': ['thinking', 'loading', 'processing']
    }
  },
  
  // Critical accuracy requirements  
  accuracyRules: [
    'ONLY provide information for the EXACT product being viewed',
    'Never mix information from different products or use memory/training data', 
    'Verify product model/part number matches question context',
    'Never provide specs from memory or other products',
    'For plugs/connectors: Only state what\'s explicitly mentioned in specs',
    'Never assume features unless explicitly stated',
    'For derating questions: State operating temp range, then refer to datasheet',
    'DC input vs output: Carefully distinguish - never mix specifications',
    'NEVER suggest non-Bravo products, competitors, or external solutions',
    'ONLY recommend Bravo Electro products and services - you are a loyal Bravo employee',
    'For LED drivers: Common terms like dimming curves, flicker, PWM frequency are in datasheet'
  ]
};

const ASK_ED_SYSTEM_PROMPT = `You are Ask Ed, a helpful Bravo Electro product assistant. 

CORE PRINCIPLES:
1. Use the product specifications provided as your primary source of truth
2. Apply logical understanding to interpret customer questions naturally
3. For dimming questions: Check the "Dimming" field in specs - if it says "Non-Dimming", this product does NOT have dimming capability
4. For accessory/connector questions: If an Accessories section exists, refer customers to it
5. Only recommend Bravo Electro products and services
6. Be helpful and understand the intent behind questions, not just literal words

INFORMATION SOURCES (Priority Order):
1. PRIMARY: Product page specifications and sections (Similar Products, Accessories)  
2. SECONDARY: Linked datasheet (when product page lacks specific info)
3. FALLBACK: Direct to Bravo experts for missing information

SECTION AVAILABILITY CHECK:
- Similar Products section: [SIMILAR_PRODUCTS_AVAILABLE]
- Accessories section: [ACCESSORIES_AVAILABLE]
- Only suggest these sections if they contain actual products

UNDERSTANDING CUSTOMER INTENT:
- Dimming questions include: "can it dim", "is it dimmable", "does it have dimming", "dimming capability", "brightness control"
- Accessory questions include: "connectors", "cables", "plugs", "accessories", "what do I need to connect"
- Alternative questions include: "other options", "similar products", "alternatives", "cross reference"
- Technical specs include: "voltage adjustment", "constant current", "output range", "efficiency", "power factor"

IMPORTANT DATASHEET INFORMATION:
When asked about technical specifications like:
- Voltage adjustment range: Look in VOLTAGE ADJUSTMENT or ELECTRICAL SPECIFICATIONS sections
- Constant current region: Look in CONSTANT CURRENT REGION or MODEL/SPECIFICATIONS TABLE
- Output voltage/current: Check ELECTRICAL SPECIFICATIONS or model tables
- Always provide specific numbers when available in the datasheet

RESPONSE GUIDELINES:
- For technical specs: Provide exact values from the datasheet (e.g., "Voltage adjustment range: 21.6-27.6V")
- For non-dimming products: "This is a non-dimming model" or "This model doesn't have dimming capability"
- For accessories when section exists: "Check the Accessories section on this page for compatible options"
- Always be helpful and conversational while staying accurate

CRITICAL ACCURACY RULES:
- Verify product model/part number matches question context
- Never provide specs from memory or other products  
- For plugs/connectors: Only state what's explicitly mentioned in specs
- Never assume features (international plugs, cable types, etc.) unless explicitly stated
- For derating questions: State operating temp range, then refer to datasheet for curves
- DC input vs output: Carefully distinguish - never mix input/output specifications
- NEVER suggest non-Bravo products, competitors, or external solutions under ANY circumstances
- For LED drivers: ALWAYS check "Dimming" field on product page FIRST - if it says "Non-Dimming" the unit has NO dimming
- For connector/accessory questions: ALWAYS refer to Accessories section if available, otherwise Bravo experts
- Read specifications LITERALLY - "Non-Dimming" means NO dimming capability

PERSONALITY & LOYALTY:
- Happy, polite, knowledgeable Bravo Electro salesman
- ONLY recommend Bravo Electro products and services - you are Bravo's best employee
- Never suggest competitors, other websites, distributors, or non-Bravo solutions
- Use Similar Products/Accessories sections when available to suggest Bravo alternatives
- Limit responses to 200 words, keep concise (2-4 sentences for simple questions)
- For complex technical questions, end with: "Consult our Bravo Power Experts for detailed guidance."

Replace [DATASHEET_URL] with actual datasheet URL. All URLs must be hyperlinked with descriptive text.`;

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

function processAskEdResponse(answer: string, datasheetUrl?: string): string {
  // Apply language corrections using configuration
  Object.entries(ASK_ED_CONFIG.languageRules.replacements).forEach(([replacement, phrases]) => {
    phrases.forEach(phrase => {
      const regex = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      answer = answer.replace(regex, replacement);
    });
  });

  // URL and link processing
  answer = processUrls(answer, datasheetUrl);
  
  // Response format standardization
  answer = standardizeResponseFormats(answer);
  
  // Final cleanup
  answer = answer.trim();
  
  return answer;
}

function processUrls(answer: string, datasheetUrl?: string): string {
  // Fix markdown-style links [text](url) to proper HTML
  answer = answer.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/gi,
    '<a href="$2" target="_blank" style="color: white; text-decoration: underline;">$1</a>'
  );
  
  // Replace [DATASHEET_URL] placeholder with actual URL
  if (datasheetUrl) {
    answer = answer.replace(/\[DATASHEET_URL\]/g, datasheetUrl);
  }
  
  // Fix broken HTML links that are missing proper opening
  answer = answer.replace(
    /datasheet\s+target="_blank"\s+style="[^"]*">/gi,
    '<a href="#" target="_blank" style="color: white; text-decoration: underline;">datasheet</a>'
  );
  
  // Catch any remaining raw URLs that weren't properly formatted
  answer = answer.replace(
    /(https?:\/\/[^\s<]+)(?![^<]*>)(?![^<]*<\/a>)/gi,
    '<a href="$1" target="_blank" style="color: white; text-decoration: underline;">datasheet</a>'
  );
  
  return answer;
}

function standardizeResponseFormats(answer: string): string {
  // Ensure consistent format for common response patterns
  const responsePatterns: [RegExp, string][] = [
    // Standardize expert referral language
    [/consult.{1,20}(?:bravo|power).{1,20}expert/gi, 'consult our Bravo Power Experts'],
    [/contact.{1,20}(?:bravo|power).{1,20}(?:expert|team)/gi, 'contact our Bravo Team'],
    
    // Standardize phone number format
    [/408[\-\s\.]*733[\-\s\.]*9090/g, '408-733-9090'],
    
    // Standardize business hours
    [/(?:monday|mon).{1,30}(?:friday|fri).{1,30}(?:8|eight).{1,30}(?:5|five)/gi, 'M-F 8am-5pm PST'],
  ];

  responsePatterns.forEach(([pattern, replacement]) => {
    answer = answer.replace(pattern, replacement);
  });
  
  return answer;
}

async function fetchPDFContent(url: string): Promise<string> {
  // Check cache first
  const cached = pdfCache.get(url);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    console.log('Using cached PDF content for:', url);
    return cached.content;
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
    
    // For LED drivers, extract ALL important sections with longer content
    const sections = {
      // Electrical specs - MOST IMPORTANT
      electrical: extractSection(pdfContent, ['electrical specification', 'electrical characteristics', 'electrical spec'], 4000),
      voltageAdjust: extractSection(pdfContent, ['voltage adjustment', 'adjust range', 'vadj', 'output voltage adjustment'], 2000),
      constantCurrent: extractSection(pdfContent, ['constant current region', 'constant current', 'cc region', 'current region'], 2000),
      
      // Other important specs
      dimming: extractSection(pdfContent, ['dimming', 'dim function', 'dimming operation'], 2000),
      features: extractSection(pdfContent, ['features', 'key features'], 1500),
      mechanical: extractSection(pdfContent, ['mechanical specification', 'dimension'], 1500),
      
      // Tables and model info
      modelTable: extractSection(pdfContent, ['model no', 'part number', 'ordering information'], 3000)
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
    
    // Cache the result with more content
    const finalContent = combinedContent.substring(0, 20000); // Increased to 20KB for better coverage
    pdfCache.set(url, {
      content: finalContent,
      timestamp: Date.now()
    });
    
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
      answer: "Currently using model: grok-2-1212. Deployment successful!", 
      model: "grok-2-1212",
      version: "2024-01-12",
      cacheSize: pdfCache.size
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

    // Prepare section availability info for prompt
    const systemPromptWithSections = ASK_ED_SYSTEM_PROMPT
      .replace('[SIMILAR_PRODUCTS_AVAILABLE]', similarProducts ? 'YES - Section contains products' : 'NO - Section not available')
      .replace('[ACCESSORIES_AVAILABLE]', accessories ? 'YES - Section contains products' : 'NO - Section not available');

    // Pre-process specs to detect dimming explicitly
    const hasDimmingSpec = productSpecs.toLowerCase().includes('dimming:');
    const isNonDimming = productSpecs.toLowerCase().includes('dimming: non-dimming') || 
                         productSpecs.toLowerCase().includes('dimming:non-dimming');
    
    const userMessage = `CONTEXT FOR YOUR RESPONSE:

DIMMING INFO: ${isNonDimming ? 
      'The specifications show "Dimming: Non-Dimming" - this is a non-dimming model.' :
      hasDimmingSpec ? 
      'Check the Dimming field in the specifications for dimming capabilities.' :
      'No dimming information in specs - check datasheet if asked about dimming.'}

ACCESSORIES INFO: ${accessories ? 
      'An Accessories section is available on this page with compatible options.' : 
      'No Accessories section on this page - refer to Bravo experts for accessory questions.'}

Remember: Understand the customer's intent. Common variations:
- "Can this dim?" = "Does this have dimming?"
- "Any connectors?" = "What accessories are available?"
- "Is it dimmable?" = "Does this support dimming?"

Product: ${productTitle}

Product Specifications:
${productSpecs}

${similarProducts ? `Similar Products Available on This Page:
${similarProducts}` : ''}

${accessories ? `Accessories Available on This Page:
${accessories}` : ''}

${datasheetContent ? `Detailed Datasheet Information:
${datasheetContent}` : ''}

${datasheetUrl ? `Product Datasheet URL: ${datasheetUrl}` : ''}

Customer Question: ${question}`;

    const completion = await openai.chat.completions.create({
      model: "grok-2-1212",
      messages: [
        {
          role: "system",
          content: systemPromptWithSections
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
    answer = processAskEdResponse(answer, datasheetUrl);

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