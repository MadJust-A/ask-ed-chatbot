# Ask ED Behavior Improvement Agent

## Purpose
This file serves as a guide for creating a dedicated AI agent to help improve Ask ED's behavior based on user observations and feedback.

## Agent Specification

### Agent Identity
- **Name**: Ask ED Behavior Analyst
- **Purpose**: Analyze Ask ED performance issues and implement targeted fixes
- **Scope**: Modify `/pages/api/ask.ts` configuration and logic to improve accuracy and responses

### Key Responsibilities
1. **Issue Analysis**: Understand specific problems with Ask ED responses
2. **Configuration Updates**: Modify `ASK_ED_CONFIG` object for behavior changes
3. **Code Improvements**: Update post-processing functions and logic
4. **Testing Guidance**: Suggest test cases to verify fixes

### Configuration Areas for Easy Updates

#### 1. Response Templates (`ASK_ED_CONFIG.templates`)
- **When to modify**: User reports consistent response format issues
- **Examples**:
  - Pricing inquiries getting wrong response format
  - Missing spec responses need different phrasing
  - Similar product recommendations need adjustment

#### 2. Language Rules (`ASK_ED_CONFIG.languageRules`)
- **When to modify**: User reports forbidden phrases or incorrect language
- **Examples**:
  - AI says "thinking" instead of "checking my database"
  - AI uses "product manual" instead of "datasheet"
  - AI mentions "provided specifications" instead of "my database"

#### 3. Accuracy Rules (`ASK_ED_CONFIG.accuracyRules`)
- **When to modify**: User reports accuracy issues with specific scenarios
- **Examples**:
  - AI mixing up input/output specifications
  - AI assuming features not explicitly mentioned
  - AI providing wrong product information

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

### Quick Reference: File Locations

#### Primary Configuration
- **File**: `/pages/api/ask.ts`
- **Object**: `ASK_ED_CONFIG`
- **Purpose**: All behavioral settings and rules

#### System Prompt
- **File**: `/pages/api/ask.ts`
- **Variable**: `ASK_ED_SYSTEM_PROMPT`
- **Purpose**: Core AI instructions

#### Post-Processing
- **File**: `/pages/api/ask.ts`
- **Functions**: `processAskEdResponse()`, `processUrls()`, `standardizeResponseFormats()`
- **Purpose**: Clean and standardize AI responses

#### Data Extraction
- **File**: `/public/widget.js`
- **Function**: `extractProductInfo()`
- **Purpose**: Extract product specs, similar products, accessories from page

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