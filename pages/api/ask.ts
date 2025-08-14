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
  apiKey: process.env.OPENAI_API_KEY,
});

// Add debug logging for API key
console.log('OPENAI_API_KEY present:', !!process.env.OPENAI_API_KEY);
console.log('OPENAI_API_KEY length:', process.env.OPENAI_API_KEY?.length || 0);

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

// ASK ED CONFIGURATION - Updated for GPT-4o-mini
const ASK_ED_CONFIG = {
  // Core behavior settings
  maxTokens: 300,
  temperature: 0.1,
  maxResponseWords: 200,
  maxProductPageTokens: 2000,
  maxDatasheetTokens: 8000,
  
  // LED Driver Terminology Guide - WHERE TO FIND SPECIFIC INFO
  ledDriverTerminology: {
    'dimming': {
      primarySource: 'Product page Specifications section - look for "Dimming" field',
      values: ['Non-Dimming', '3-in-1 Dimming', '0-10V Dimming', 'DALI', 'PWM'],
      secondarySource: 'If dimming exists, check datasheet for dimming curves and details'
    },
    'constant current range': {
      primarySource: 'Datasheet - look for "Constant Current Region", "Constant Current Voltage Range", or "CC Region" section',
      note: 'Check the appropriate model row/column in the datasheet table - often expressed as voltage range (e.g., 18-36V)',
      aliases: ['constant current voltage range', 'cc region', 'led voltage range', 'forward voltage range']
    },
    'IP rating': {
      primarySource: 'Product page Specifications - look for "IP Rating" or "Ingress Protection"',
      secondarySource: 'Datasheet for detailed environmental specifications'
    },
    'efficiency': {
      primarySource: 'Product page Specifications - may show typical efficiency %',
      secondarySource: 'Datasheet for efficiency curves at different loads'
    }
  },
  
  // LED Driver Model Suffix Meanings - CRITICAL FOR ADJUSTABLE FEATURES
  ledDriverSuffixes: {
    'blank': {
      description: 'IP67 with fixed Io (current output) and Vo (voltage output)',
      adjustable: false,
      dimming: false,
      ipRating: 'IP67'
    },
    'A': {
      description: 'IP65 with Io (current output) and Vo (voltage output) adjustable through built-in potentiometer',
      adjustable: true,
      adjustmentMethod: 'built-in potentiometer',
      dimming: false,
      ipRating: 'IP65'
    },
    'B': {
      description: 'IP67 with 3-in-1 dimming function (1-10Vdc, 10V PWM signal and resistance)',
      adjustable: false,
      dimming: true,
      dimmingTypes: ['1-10Vdc', '10V PWM', 'resistance'],
      ipRating: 'IP67'
    },
    'AB': {
      description: 'IP65 with Io (current output) and Vo (voltage output) adjustable through built-in potentiometer AND 3-in-1 dimming function',
      adjustable: true,
      adjustmentMethod: 'built-in potentiometer',
      dimming: true,
      dimmingTypes: ['1-10Vdc', '10V PWM', 'resistance'],
      ipRating: 'IP65'
    }
  },
  
  // Response format templates
  templates: {
    missingSpec: "I don't see [REQUESTED_SPEC] in my database for this product. Please check the <a href='[DATASHEET_URL]' target='_blank' style='color: white; text-decoration: underline;'>datasheet</a> for complete details.",
    similarProducts: "Check the 'Similar Products' section on this product page for Bravo alternatives.",
    accessories: "Check the 'Accessories' section on this product page for compatible connectors and add-ons. If you don't see what you need, contact our Bravo Power Experts.",
    pricing: "Contact our team at 408-733-9090 or fill out our <a href='https://www.bravoelectro.com/rfq-form' target='_blank' style='color: white; text-decoration: underline;'>RFQ Form</a>.",
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
      'not explicitly stated'
    ],
    replacements: {
      'my database': ['provided product specifications', 'detailed datasheet', 'product specifications or detailed datasheet'],
      'I don\'t see this information': ['not explicitly provided', 'doesn\'t explicitly provide', 'not explicitly stated']
    }
  },
  
  // Critical accuracy requirements  
  accuracyRules: [
    'ONLY provide information for the EXACT product model being viewed - match model number precisely',
    'When reading tables, use ONLY the row for the current model (e.g., HLG-120H-48A row for HLG-120H-48A)',
    'NEVER mix information from different model variants in the same table',
    'Never mix information from different products or use memory/training data', 
    'Verify product model/part number matches question context exactly',
    'For LED drivers: ALWAYS check "Dimming" field on product page FIRST - if it says "Non-Dimming" the unit has NO dimming',
    'For LED drivers/power supplies: ALWAYS analyze model suffix to determine adjustable features - A=adjustable, B=dimming, AB=both, blank=fixed',
    'When asked about adjustability: Check model suffix FIRST, then confirm with datasheet specs',
    'Be explicit about suffix meanings: "The A suffix indicates adjustable output through built-in potentiometer"',
    'NEVER include raw URLs in responses - all URLs must be hyperlinked to descriptive text',
    'NEVER suggest non-Bravo products, competitors, or external solutions',
    'ONLY recommend Bravo Electro products and services - you are a loyal Bravo employee'
  ]
};

const ASK_ED_SYSTEM_PROMPT = `You are Ask ED, a specialized product Q&A assistant for Bravo Electro (www.bravoelectro.com) powered by GPT-4o-mini.

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
- CRITICAL: Only suggest Similar Products section if similarProducts data is provided and contains actual product information
- CRITICAL: Only suggest Accessories section if accessories data is provided and contains actual product information
- NEVER suggest sections that don't exist on the current product page
- If no similarProducts or accessories data provided, do NOT mention these sections

UNDERSTANDING CUSTOMER INTENT:
- Dimming questions include: "can it dim", "is it dimmable", "does it have dimming", "dimming capability", "brightness control"
- Adjustable output questions include: "adjustable", "variable", "can I adjust", "potentiometer", "trim pot", "voltage adjustment", "current adjustment"
- Constant current questions include: "constant current region", "constant current voltage range", "cc region", "cc voltage range", "led voltage range"
- Accessory questions include: "connectors", "cables", "plugs", "accessories", "what do I need to connect"
- Alternative questions include: "other options", "similar products", "alternatives", "cross reference"
- Technical specs include: "voltage adjustment", "constant current", "output range", "efficiency", "power factor"

INTERPRETING SPECIFICATION TABLES - CRITICAL MODEL AND COLUMN MATCHING:
- MOST IMPORTANT: You MUST match the EXACT model number being viewed (provided as "Product:")
- Specification tables contain MULTIPLE rows for different model variants (e.g., HLG-120H-12A, HLG-120H-24A, HLG-120H-36A, HLG-120H-48A)
- NEVER provide specs from a different model row - this is a critical error
- Process for finding specs:
  1. Identify the EXACT model number from "Product:" (e.g., HLG-120H-48A)
  2. Find that EXACT model's row in the specification table
  3. Identify the CORRECT COLUMN for the requested specification
  4. Read the value from the INTERSECTION of the correct row AND column
  5. VERIFY: Confirm you're reading the right column (not confusing similar columns)

CRITICAL COLUMN DIFFERENTIATION:
- "Constant Current Region" column: Shows the voltage range where constant current is maintained (e.g., "24~48V")
- "Voltage ADJ. Range" column: Shows the adjustment range for output voltage via potentiometer (e.g., "43.2~52.8V")
- These are TWO DIFFERENT columns with DIFFERENT values
- When asked for "voltage adjustment range" → Read "Voltage ADJ. Range" column ONLY
- When asked for "constant current region/range" → Read "Constant Current Region" column ONLY
- DO NOT confuse these columns - they contain different information
- Example for HLG-120H-48A:
  • Constant Current Region might be: "24~48V"
  • Voltage ADJ. Range might be: "43.2~52.8V"
  • These are DIFFERENT specifications from DIFFERENT columns

RESPONSE GUIDELINES:
- For constant current region: Look ONLY at "Constant Current Region" column, provide exact value (e.g., "The constant current region is 24-48V")
- For voltage adjustment: Look ONLY at "Voltage ADJ. Range" column, provide exact value (e.g., "The voltage adjustment range is 43.2-52.8V")
- CRITICAL: These are DIFFERENT columns - never give constant current values when asked for adjustment range
- For current adjustment: Look for "Current ADJ. Range" column if available
- For technical specs: Always provide exact values from the correct column in the datasheet tables
- For non-dimming products: "This is a non-dimming model" or "This model doesn't have dimming capability"
- For accessories when section exists: "Check the Accessories section on this page for compatible options"
- Always be helpful and conversational while staying accurate
- NEVER include raw URLs in responses - all URLs must be hyperlinked to descriptive text

CRITICAL ACCURACY RULES:
- ABSOLUTE PRIORITY: Verify product model/part number matches EXACTLY - no exceptions
- When reading specification tables, ONLY use data from the row matching the current product model
- NEVER provide specs from a different model variant (e.g., don't give HLG-120H-36A specs for HLG-120H-48A)
- Never provide specs from memory or other products  
- For plugs/connectors: Only state what's explicitly mentioned in specs
- Never assume features (international plugs, cable types, etc.) unless explicitly stated
- For derating questions: State operating temp range, then refer to datasheet for curves
- DC input vs output: Carefully distinguish - never mix input/output specifications
- NEVER suggest non-Bravo products, competitors, or external solutions under ANY circumstances
- For LED drivers: ALWAYS check "Dimming" field on product page FIRST - if it says "Non-Dimming" the unit has NO dimming
- For connector/accessory questions: ALWAYS refer to Accessories section if available, otherwise Bravo experts
- Read specifications LITERALLY - "Non-Dimming" means NO dimming capability

LED DRIVER SUFFIX ANALYSIS - CRITICAL FOR ADJUSTABLE FEATURES:
- ALWAYS analyze the model suffix (letters after the base model number) to determine adjustable features
- Suffix meanings for LED drivers/power supplies:
  • NO SUFFIX (blank): Fixed output current and voltage (not adjustable)
  • "A" suffix: Output current AND voltage are ADJUSTABLE via built-in potentiometer (also changes IP rating to IP65)
  • "B" suffix: Has 3-in-1 dimming function (1-10Vdc, PWM, resistance) but output is NOT adjustable
  • "AB" suffix: BOTH adjustable output AND dimming functions (IP65 rating)
- Examples: HLG-120H-12A = adjustable output, HLG-120H-12AB = adjustable + dimming, HLG-120H-12 = fixed output
- When asked about adjustability: Check suffix FIRST, then confirm with datasheet specifications
- Be explicit: "The 'A' suffix indicates this model has adjustable current and voltage output through a built-in potentiometer"

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
  // CRITICAL: Clean up AI's markdown hyperlinking mistakes
  console.log('Processing response - Original:', answer.substring(0, 200));
  
  // Step 1: Convert raw URLs to hyperlinks FIRST (before other processing)
  answer = answer.replace(/\bhttps?:\/\/[^\s\)]+/gi, (url) => {
    // Extract descriptive text based on URL pattern
    let linkText = 'link';
    
    if (url.includes('bravoelectro.com/rfq-form')) {
      linkText = 'RFQ Form';
    } else if (url.includes('datasheet') || url.includes('.pdf')) {
      linkText = 'datasheet';
    } else if (url.includes('bravoelectro.com')) {
      linkText = 'product page';
    } else if (url.includes('meanwell')) {
      linkText = 'datasheet';
    } else {
      linkText = 'here';
    }
    
    return `<a href="${url}" target="_blank" style="color: white; text-decoration: underline;">${linkText}</a>`;
  });
  
  // Step 2: Remove ALL broken/invalid markdown links
  // Remove [Mean Well](anything), [Mean](anything), [link](anything)
  answer = answer.replace(/\[(Mean Well|Mean|Meanwell|link)\]\([^)]*\)/gi, '$1');
  
  // Remove markdown links to .html files that aren't full URLs
  answer = answer.replace(/\[([^\]]+)\]\((?!https?:\/\/)[^)]*\.html\)/gi, '$1');
  
  // Remove [datasheet](link) or similar broken patterns
  answer = answer.replace(/\[([^\]]+)\]\((link|#|javascript:|data:)\)/gi, '$1');
  
  // Step 2: Track what we've already linked to prevent duplicates
  const linkedItems = new Set<string>();
  let processedAnswer = answer;
  
  // Step 3: Process valid markdown links (ONLY FIRST OCCURRENCE)
  // Handle RFQ Form markdown links
  let rfqLinked = false;
  processedAnswer = processedAnswer.replace(/\[RFQ Form\]\(https:\/\/www\.bravoelectro\.com\/rfq-form\)/gi, (match) => {
    if (rfqLinked) return 'RFQ Form'; // Already linked, return plain text
    rfqLinked = true;
    return '<a href="https://www.bravoelectro.com/rfq-form" target="_blank" style="color: white; text-decoration: underline;">RFQ Form</a>';
  });
  
  // Handle datasheet markdown links
  let datasheetLinked = false;
  if (datasheetUrl) {
    // Match any variation of [datasheet](URL)
    processedAnswer = processedAnswer.replace(/\[datasheet\]\([^)]+\)/gi, (match) => {
      if (datasheetLinked) return 'datasheet'; // Already linked, return plain text
      datasheetLinked = true;
      return `<a href="${datasheetUrl}" target="_blank" style="color: white; text-decoration: underline;">datasheet</a>`;
    });
  }
  
  // Handle product SKU markdown links
  let productLinked = false;
  if (productTitle) {
    const modelMatch = productTitle.match(/^([A-Z0-9\-\.]+)/i);
    if (modelMatch) {
      const modelNumber = modelMatch[1];
      const urlSlug = modelNumber.toLowerCase().replace(/\./g, '-');
      const productUrl = `https://www.bravoelectro.com/${urlSlug}.html`;
      
      // Match markdown format for this specific product
      const mdRegex = new RegExp(`\\[${modelNumber.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]\\([^)]+\\)`, 'gi');
      processedAnswer = processedAnswer.replace(mdRegex, (match) => {
        if (productLinked) return modelNumber; // Already linked, return plain text
        productLinked = true;
        return `<a href="${productUrl}" target="_blank" style="color: white; text-decoration: underline;">${modelNumber}</a>`;
      });
    }
  }
  
  // Step 4: Handle plain text mentions (ONLY if not already linked)
  // Link first plain "RFQ Form" if not already linked
  if (!rfqLinked) {
    processedAnswer = processedAnswer.replace(/\bRFQ Form\b/, (match) => {
      if (rfqLinked) return match;
      rfqLinked = true;
      return '<a href="https://www.bravoelectro.com/rfq-form" target="_blank" style="color: white; text-decoration: underline;">RFQ Form</a>';
    });
  }
  
  // Link first plain "datasheet" if not already linked
  if (datasheetUrl && !datasheetLinked) {
    processedAnswer = processedAnswer.replace(/\bdatasheet\b/, (match) => {
      if (datasheetLinked) return match;
      datasheetLinked = true;
      return `<a href="${datasheetUrl}" target="_blank" style="color: white; text-decoration: underline;">datasheet</a>`;
    });
  }
  
  // Link first plain product model if not already linked
  if (productTitle && !productLinked) {
    const modelMatch = productTitle.match(/^([A-Z0-9\-\.]+)/i);
    if (modelMatch) {
      const modelNumber = modelMatch[1];
      const urlSlug = modelNumber.toLowerCase().replace(/\./g, '-');
      const productUrl = `https://www.bravoelectro.com/${urlSlug}.html`;
      
      const modelRegex = new RegExp(`\\b${modelNumber.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
      processedAnswer = processedAnswer.replace(modelRegex, (match) => {
        if (productLinked) return match;
        productLinked = true;
        return `<a href="${productUrl}" target="_blank" style="color: white; text-decoration: underline;">${modelNumber}</a>`;
      });
    }
  }
  
  // Step 5: Clean up any remaining broken markdown or HTML
  // Remove empty markdown links
  processedAnswer = processedAnswer.replace(/\[([^\]]+)\]\(\)/g, '$1');
  
  // Remove any links to "mean.html" that somehow got through
  processedAnswer = processedAnswer.replace(/<a[^>]*href="[^"]*mean\.html"[^>]*>([^<]+)<\/a>/gi, '$1');
  
  // Remove any standalone "link" that got hyperlinked
  processedAnswer = processedAnswer.replace(/<a[^>]*>link<\/a>/gi, 'link');
  
  console.log('Processing response - Final:', processedAnswer.substring(0, 200));
  
  return processedAnswer.trim();
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
    
    // Enhanced datasheet extraction - capturing full specification tables and embedded data
    const sections = {
      // CRITICAL: Extract full specification tables where constant current info lives
      specificationTable: extractSection(pdfContent, [
        'constant current region', 'voltage adj. range', 'voltage adj range', 'adj. range',
        'output voltage', 'output current', 'rated power', 'rated current',
        'model', 'dc output', 'output', 'specification', 'electrical characteristics',
        'electrical specification', 'specifications', 'electrical spec'
      ], 10000), // Maximum extraction to capture full tables with all columns
      
      // Model-specific tables and ordering info
      modelTable: extractSection(pdfContent, ['model no', 'part number', 'ordering information', 'model table', 'model list'], 4000),
      
      // Voltage/Current specifications - where constant current info is embedded
      outputSpecs: extractSection(pdfContent, [
        'constant current region', 'voltage adj. range', 'voltage adj range', 'adj. range',
        'voltage range', 'current range', 'output voltage range', 'output current range',
        'constant current', 'cc region', 'constant voltage', 'cv region',
        'voltage', 'current', 'vdc', 'adc', 'output', 'v adj', 'i adj'
      ], 6000),
      
      // Adjustment ranges - CRITICAL for A suffix models
      voltageAdjust: extractSection(pdfContent, ['voltage adj. range', 'voltage adjustment', 'vadj', 'output voltage adjustment', 'potentiometer', 'trim pot', 'adjustment range', 'voltage adj range'], 3000),
      currentAdjust: extractSection(pdfContent, ['current adj. range', 'current adjustment', 'iadj', 'output current adjustment', 'current adj range'], 2000),
      
      // Mechanical specifications - for mounting/installation questions
      mechanical: extractSection(pdfContent, ['mechanical specification', 'mechanical drawing', 'mounting', 'dimensions', 'hole diameter', 'hole spacing', 'mounting holes', 'mechanical dimension'], 2000),
      
      // Model suffix information
      suffixInfo: extractSection(pdfContent, ['model suffix', 'suffix code', 'model code', 'ordering information', 'model designation'], 1500),
      
      // Other specs
      dimming: extractSection(pdfContent, ['dimming', 'dim function', 'dimming operation'], 1500),
      features: extractSection(pdfContent, ['features', 'key features'], 1000)
    };
    
    // Combine ALL content - prioritize technical specs
    let combinedContent = `COMPLETE DATASHEET CONTENT:

`;
    
    // HIGHEST PRIORITY: Full specification tables (where constant current info lives)
    if (sections.specificationTable) {
      combinedContent += `SPECIFICATION TABLE:
${sections.specificationTable}

`;
    }
    
    // Output specifications including voltage/current ranges
    if (sections.outputSpecs) {
      combinedContent += `OUTPUT SPECIFICATIONS:
${sections.outputSpecs}

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
    
    // If critical sections are missing, include more raw content
    if (!sections.specificationTable || !sections.outputSpecs) {
      combinedContent += `ADDITIONAL DATASHEET TEXT:
${pdfContent.substring(0, 6000)}
`;
    }
    
    // Maximum extraction for complete specification tables
    const finalContent = combinedContent.substring(0, 8000); // ~2000 tokens for complete tables
    setCachedContent(pdfCache, url, finalContent);
    
    console.log('PDF extraction complete. Sections found:', {
      specificationTable: !!sections.specificationTable,
      outputSpecs: !!sections.outputSpecs,
      voltageAdjust: !!sections.voltageAdjust,
      currentAdjust: !!sections.currentAdjust,
      mechanical: !!sections.mechanical,
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
      answer: "Currently using hybrid model: gpt-4o for technical specs, gpt-4o-mini for general questions. Deployment successful!", 
      model: "hybrid: gpt-4o + gpt-4o-mini",
      version: "2024-12-17",
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
    // Determine which model to use based on question type
    const technicalSpecKeywords = [
      'constant current', 'voltage range', 'current range', 'adjustment range',
      'voltage adj', 'current adj', 'output voltage', 'output current',
      'voltage adjustment', 'current adjustment', 'adjust the voltage', 'adjust the current',
      'electrical spec', 'power rating', 'efficiency', 'power factor',
      'derating', 'temperature', 'protection', 'ripple', 'regulation',
      'cc region', 'cv region', 'adjustable', 'potentiometer', 'trim', 'tuning'
    ];
    
    const questionLower = question.toLowerCase();
    const isTechnicalSpec = technicalSpecKeywords.some(keyword => questionLower.includes(keyword));
    const hasAdjustableSuffix = productTitle.includes('-A') || productTitle.includes('-AB');
    
    // Use GPT-4o for technical specs, tables, and adjustable models
    const useAdvancedModel = isTechnicalSpec || (hasAdjustableSuffix && questionLower.includes('adjust'));
    const selectedModel = useAdvancedModel ? "gpt-4o" : "gpt-4o-mini";
    
    console.log('Question type:', isTechnicalSpec ? 'Technical Specification' : 'General');
    console.log('Selected model:', selectedModel);
    
    // Fetch PDF datasheet content if available
    let datasheetContent = '';
    if (datasheetUrl) {
      console.log('Fetching datasheet:', datasheetUrl);
      datasheetContent = await fetchPDFContent(datasheetUrl);
      if (datasheetContent) {
        console.log('Successfully extracted PDF content, length:', datasheetContent.length);
      }
    }

    // Check section availability
    const hasSimilarProducts = similarProducts && similarProducts.trim().length > 10;
    const hasAccessories = accessories && accessories.trim().length > 10;
    
    // Optimize token usage for cost-effectiveness
    const truncatedSpecs = productSpecs.substring(0, ASK_ED_CONFIG.maxProductPageTokens);
    const truncatedDatasheet = datasheetContent.substring(0, ASK_ED_CONFIG.maxDatasheetTokens);
    
    const userMessage = `CURRENT PRODUCT MODEL (IMPORTANT - MATCH EXACTLY): ${productTitle}

Product Specifications:
${truncatedSpecs}

${truncatedDatasheet ? `Datasheet Info (USE ONLY DATA FOR MODEL: ${productTitle}):
${truncatedDatasheet}` : ''}

${datasheetUrl ? `Datasheet URL: ${datasheetUrl}` : ''}

${hasSimilarProducts ? `Similar Products Available:
${similarProducts}` : 'Similar Products: None available on this page'}

${hasAccessories ? `Accessories Available:
${accessories}` : 'Accessories: None available on this page'}

Question: ${question}`;

    // Create dynamic system prompt with section availability
    
    const dynamicSystemPrompt = ASK_ED_SYSTEM_PROMPT
      .replace('[SIMILAR_PRODUCTS_AVAILABLE]', hasSimilarProducts ? 'Available' : 'Not Available') 
      .replace('[ACCESSORIES_AVAILABLE]', hasAccessories ? 'Available' : 'Not Available');

    const completion = await openai.chat.completions.create({
      model: selectedModel,
      messages: [
        {
          role: "system",
          content: dynamicSystemPrompt
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
    
    // Add model info to response for debugging (remove in production if desired)
    const responseData: AskResponse = { 
      answer,
      model: selectedModel
    };

    res.status(200).json(responseData);

  } catch (error) {
    console.error('OpenAI API error:', error);
    console.error('Error details:', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      hasApiKey: !!process.env.OPENAI_API_KEY
    });
    res.status(500).json({ 
      error: 'I\'m experiencing technical difficulties. Please contact a Bravo Power Expert via web chat or call 408-733-9090.',
      debug: process.env.NODE_ENV === 'development' ? error instanceof Error ? error.message : String(error) : undefined
    });
  }
}