# Ask ED Desktop Version Summary

## Current Stable Version
- **Branch**: `desktop-version-stable` 
- **Deployment**: Working with GPT-4o-mini
- **Date**: December 2024

## Key Components

### 1. API Configuration (`/pages/api/ask.ts`)
- **Model**: GPT-4o-mini
- **Max Tokens**: 300
- **Temperature**: 0.1
- **Datasheet Extraction**: 50KB limit with 12 specialized sections
- **Cache Duration**: 1 hour

### 2. Widget (`/public/widget.js`)
- **Styling**: Glassmorphism with Bravo colors (#005aa6 blue, #ebb013 gold)
- **Position**: Fixed bottom-right corner
- **Animation**: Red scanning line on hover
- **Chat Window**: 420px x 600px

### 3. Key Features Working
- ✅ Product specification extraction from page
- ✅ PDF datasheet parsing and caching
- ✅ Similar Products and Accessories section detection
- ✅ Hyperlink processing (one-time linking rule)
- ✅ Rate limiting (5/min, 50/day)
- ✅ Input validation and security

### 4. Enhanced Datasheet Extraction Sections
1. Model/Specifications Tables (8KB)
2. Electrical Specifications (8KB)  
3. Voltage Adjustment (4KB)
4. Current Adjustment (3KB)
5. Constant Current Region (4KB)
6. Protection Features (3KB)
7. Environmental Specs (3KB)
8. Mechanical Specs (3KB)
9. Dimming Information (4KB)
10. Efficiency/PFC (2KB)
11. Derating Information (2KB)
12. Features (2.5KB)

### 5. System Prompt Key Rules
- Only recommend Bravo Electro products
- Never hyperlink manufacturer names
- Provide specific numbers from datasheet
- One-time hyperlinking per response
- Direct to Bravo experts for missing info

## Environment Variables Required
```
OPENAI_API_KEY=your-key-here
```

## Deployment
- Platform: Vercel
- Auto-deploy on push to main branch
- Domain: ask-ed-chatbot.vercel.app

## Testing Checklist
- [ ] HLG-120H-24A voltage adjustment questions
- [ ] Dimming capability detection
- [ ] Accessories section referral
- [ ] RFQ Form hyperlinking
- [ ] Datasheet hyperlinking (once only)
- [ ] Product model hyperlinking

## Known Working Features
1. Correctly identifies "A" suffix models as adjustable
2. Properly extracts voltage/current adjustment ranges
3. Never links "Mean Well" or "Mean" to invalid URLs
4. Handles non-dimming products correctly
5. References page sections when available

## Files to Preserve
- `/pages/api/ask.ts` - Main API handler
- `/public/widget.js` - Embeddable widget
- `/public/ask-ed-logo.png` - Logo asset
- `/ASK_ED_AGENT.md` - Agent documentation
- `/CLAUDE.md` - Original requirements

## DO NOT MODIFY WITHOUT BACKUP
This version is stable and working correctly on desktop.
Always create a new branch before making changes.