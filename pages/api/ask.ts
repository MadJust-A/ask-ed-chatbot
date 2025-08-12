import type { NextApiRequest, NextApiResponse } from 'next';
import OpenAI from 'openai';

// Dynamic import for PDF processing to handle serverless environment
let pdfParse: any = null;
try {
  pdfParse = require('pdf-parse');
} catch (error) {
  console.log('PDF processing not available in this environment:', error instanceof Error ? error.message : String(error));
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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

const ASK_ED_SYSTEM_PROMPT = `You are Ask Ed, a Bravo Electro product assistant. 

MANDATORY RULES - VIOLATING THESE IS FORBIDDEN:
1. ONLY use the EXACT product specifications provided - NEVER use your training data
2. If specs say "Dimming: Non-Dimming" then state "This is a non-dimming model"
3. For accessory/connector questions: Check if Accessories section exists in the data provided
4. NEVER suggest non-Bravo products or competitors
5. Read specifications LITERALLY - do not interpret or assume

INFORMATION SOURCES (Priority Order):
1. PRIMARY: Product page specifications and sections (Similar Products, Accessories)  
2. SECONDARY: Linked datasheet (when product page lacks specific info)
3. FALLBACK: Direct to Bravo experts for missing information

SECTION AVAILABILITY CHECK:
- Similar Products section: [SIMILAR_PRODUCTS_AVAILABLE]
- Accessories section: [ACCESSORIES_AVAILABLE]
- Only suggest these sections if they contain actual products

RESPONSE FORMATS:
- Missing specifications: "I don't see [REQUESTED SPEC] in my database for this product. Please check the <a href='[DATASHEET_URL]' target='_blank' style='color: white; text-decoration: underline;'>datasheet</a> for complete details."
- Similar products: ONLY suggest if Similar Products section exists: "Check the 'Similar Products' section on this product page for Bravo alternatives."
- Accessories/Connectors: If Accessories section exists: "Check the 'Accessories' section on this product page for compatible connectors and add-ons. If you don't see what you need, contact our Bravo Power Experts."
- Accessories (no section): "Contact our Bravo Power Experts at 408-733-9090 for compatible connector and accessory options."
- Alternative products (when sections don't exist): "Contact our Bravo Power Experts at 408-733-9090 for product recommendations."
- Dimensions/footprint: Provide available dimensions; for mounting holes add "For specific mounting hole details, check the <a href='[DATASHEET_URL]' target='_blank' style='color: white; text-decoration: underline;'>datasheet</a>"
- Technical curves/graphs: "Detailed curve information requires reviewing the <a href='[DATASHEET_URL]' target='_blank' style='color: white; text-decoration: underline;'>datasheet</a> graphs."
- LED driver specific terms (dimming, flicker, PWM): "Check the <a href='[DATASHEET_URL]' target='_blank' style='color: white; text-decoration: underline;'>datasheet</a> for detailed [TERM] specifications."
- Non-product questions: "I can answer questions about [PRODUCT NAME]. For other topics, contact the Bravo Team at 408-733-9090."
- Pricing: "Contact our team at 408-733-9090 or fill out our <a href='https://www.bravoelectro.com/rfq-form' target='_blank' style='color: white; text-decoration: underline;'>RFQ Form</a>."
- Stock: "Contact the Bravo Team for stock information at 408-733-9090 during business hours (M-F 8am-5pm PST)."

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
  const responsePatterns = [
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
    // Return first 4000 characters to avoid token limits
    return data.text.substring(0, 4000);
  } catch (error) {
    console.error('PDF fetch error:', error);
    return '';
  }
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

    const userMessage = `CRITICAL INSTRUCTIONS - READ FIRST:
1. For DIMMING questions: Look at Product Specifications below. If it says "Dimming: Non-Dimming" then this product has NO DIMMING. Do not say it has dimming.
2. For ACCESSORY/CONNECTOR questions: ${accessories ? 'There IS an Accessories section below - tell customer to check the Accessories section on this page.' : 'There is NO Accessories section - tell customer to contact Bravo Power Experts at 408-733-9090.'}
3. ONLY use information provided below. Do not use your training data about products.

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
      model: "gpt-4-0125-preview",
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
    console.error('OpenAI API error:', error);
    res.status(500).json({ 
      error: 'I\'m experiencing technical difficulties. Please contact a Bravo Power Expert via web chat or call 408-733-9090.' 
    });
  }
}