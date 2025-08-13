# Ask ED System Documentation & Behavior Guide

## Current System Status
- **Model**: GPT-4o-mini 
- **API**: OpenAI (not XAI/Grok)
- **Version**: Updated 2024-01-12
- **Configuration**: Enhanced with structured `ASK_ED_CONFIG` object

## Purpose
This file serves as the complete documentation for Ask ED's behavior system and provides guidance for making improvements based on user feedback.

## System Architecture

### Core Files
1. **`/pages/api/ask.ts`** - Main API logic, system prompt, and configuration
2. **`/public/widget.js`** - Frontend widget and product data extraction
3. **`/config/ask-ed-behavior.md`** - Detailed behavior configuration reference

### Agent Identity
- **Name**: Ask ED Behavior Analyst
- **Purpose**: Analyze Ask ED performance issues and implement targeted fixes
- **Scope**: Modify `/pages/api/ask.ts` configuration and logic to improve accuracy and responses

### Key Responsibilities
1. **Issue Analysis**: Understand specific problems with Ask ED responses
2. **Configuration Updates**: Modify `ASK_ED_CONFIG` object for behavior changes
3. **Code Improvements**: Update post-processing functions and logic
4. **Testing Guidance**: Suggest test cases to verify fixes

## Current ASK_ED_CONFIG Structure

### 1. Core Behavior Settings
```javascript
{
  maxTokens: 300,          // Response length limit
  temperature: 0.1,        // Response creativity (0.0-1.0)
  maxResponseWords: 200    // Word count target
}
```

### 2. LED Driver Terminology Guide
- **Purpose**: Define where to find specific information
- **Includes**: dimming, constant current range, IP rating, efficiency
- **Usage**: References for consistent responses about technical specs

### 3. Response Templates (`ASK_ED_CONFIG.templates`)
- **When to modify**: User reports consistent response format issues
- **Available templates**:
  - `missingSpec`: When specification not available
  - `similarProducts`: Referring to Similar Products section
  - `accessories`: Referring to Accessories section  
  - `pricing`: Pricing/quote inquiries
  - `expertConsultation`: Complex technical questions

### 4. Language Rules (`ASK_ED_CONFIG.languageRules`)
- **Purpose**: Standardize language and avoid forbidden phrases
- **forbiddenPhrases**: Array of phrases to avoid
- **replacements**: Object mapping replacements for forbidden phrases
- **Examples**:
  - Replace "provided specifications" → "my database"
  - Replace "not explicitly provided" → "I don't see this information"

### 5. Accuracy Rules (`ASK_ED_CONFIG.accuracyRules`)
- **Purpose**: Critical accuracy requirements as array of rules
- **Key rules**:
  - Only provide info for exact product being viewed
  - Never mix information from different products
  - Always check "Dimming" field first for LED drivers
  - Never suggest non-Bravo products

### Common User Feedback Patterns & Solutions

#### Issue: "AI gave wrong product specs"
**Solution Path**:
1. Check if prompt has product verification rules
2. Add specific accuracy rule to `ASK_ED_CONFIG.accuracyRules`
3. Update post-processing to catch spec mixing

#### Issue: "URLs not properly formatted"
**Solution Path**:
1. Update `processUrls()` function with new regex patterns
2. Add specific URL patterns to catch edge cases
3. Test with actual problematic responses

#### Issue: "AI using wrong language/phrases"
**Solution Path**:
1. Add forbidden phrase to `languageRules.forbiddenPhrases`
2. Add replacement mapping in `languageRules.replacements`
3. Update `processAskEdResponse()` if needed

#### Issue: "AI not using product page sections"
**Solution Path**:
1. Check widget.js extraction selectors
2. Verify API is receiving similarProducts/accessories data
3. Update system prompt to emphasize section usage

### Agent Workflow for Improvements

#### Step 1: Issue Identification
```
User reports: "[Specific issue with Ask ED response]"
Example: "Ask ED said the LRS-1200-48 has a DC input when I asked about DC input range, but it gave me DC OUTPUT specs instead"
```

#### Step 2: Root Cause Analysis
```
Agent analyzes:
- Is this a prompt issue?
- Is this a post-processing issue?
- Is this a configuration issue?
- Is this a data extraction issue?
```

#### Step 3: Solution Implementation
```
Agent determines best fix:
- Update ASK_ED_CONFIG
- Modify post-processing functions
- Update system prompt
- Fix widget.js extraction
```

#### Step 4: Testing & Verification
```
Agent suggests test cases:
- Specific questions to ask Ask ED
- Expected correct responses
- Edge cases to verify
```

## Quick Reference: File Locations & Functions

### Primary Configuration
- **File**: `/pages/api/ask.ts` (Lines 51-112)
- **Object**: `ASK_ED_CONFIG`
- **Purpose**: All behavioral settings, templates, rules, and terminology

### System Prompt  
- **File**: `/pages/api/ask.ts` (Lines 114-166)
- **Variable**: `ASK_ED_SYSTEM_PROMPT`
- **Purpose**: Core AI instructions and behavior guidelines

### API Configuration
- **Model**: `gpt-4o-mini` (Line 613)
- **API Key**: `process.env.OPENAI_API_KEY` (Line 19)
- **Temperature**: `ASK_ED_CONFIG.temperature` (0.1)
- **Max Tokens**: `ASK_ED_CONFIG.maxTokens` (300)

### Post-Processing Functions
- **File**: `/pages/api/ask.ts`
- **Functions**: 
  - `processAskEdResponse()` - Main response processing
  - `processUrls()` - URL and hyperlink processing  
  - `standardizeResponseFormats()` - Response standardization
- **Purpose**: Clean, format, and enhance AI responses

### Data Extraction (Frontend)
- **File**: `/public/widget.js`
- **Function**: `extractProductInfo()`
- **Purpose**: Extract product specs, similar products, accessories from page
- **Returns**: Object with title, specs, datasheetUrl, similarProducts, accessories

### Debug & Testing
- **Debug Command**: Type "DEBUG_MODEL_CHECK" in Ask ED
- **Returns**: Current model, version, cache size, configuration
- **Deployment Check**: Verifies GPT-4o-mini is active

### Example Agent Interaction

**User**: "Ask ED is still showing raw URLs instead of hyperlinks when I ask about datasheets"

**Agent Response**:
```
I'll fix the URL hyperlinking issue. Let me update the post-processing function:

1. Adding more comprehensive URL regex patterns to catch edge cases
2. Updating the processUrls() function to handle datasheet mentions
3. Adding fallback patterns for any missed URLs

The fix involves modifying the processUrls() function in /pages/api/ask.ts to catch more URL patterns and ensure consistent hyperlinking.
```

### Benefits of This Agent System

1. **Rapid Iteration**: You can quickly report issues and get targeted fixes
2. **Systematic Approach**: Each fix is properly analyzed and implemented
3. **Configuration-Driven**: Most changes don't require code rewrites
4. **Traceable**: All changes are documented and reversible
5. **Scalable**: Easy to add new rules and behaviors as needs evolve

### Usage Instructions

1. **Report Issue**: Describe specific Ask ED behavior problem
2. **Agent Analyzes**: Agent determines root cause and solution approach  
3. **Implementation**: Agent makes targeted code changes
4. **Testing**: Agent provides test cases to verify fix
5. **Iteration**: Repeat for continuous improvement

This system allows for rapid, targeted improvements to Ask ED without destabilizing the entire codebase.