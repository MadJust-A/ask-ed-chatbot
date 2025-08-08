# Ask Ed Chatbot

A specialized product Q&A chatbot for Bravo Electro power supplies and electrical products.

## Features

- 🤖 AI-powered responses using OpenAI GPT-3.5
- 🛡️ Built-in rate limiting and security measures
- 📱 Responsive chat widget for Magento 2 integration
- ⚡ Automatic product specification extraction
- 🔒 Input validation and abuse prevention
- 📊 Professional electrical industry terminology

## Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up environment variables:**
   ```bash
   cp .env.local.example .env.local
   # Add your OpenAI API key to .env.local
   ```

3. **Run development server:**
   ```bash
   npm run dev
   ```

4. **Deploy to Vercel:**
   ```bash
   npm run build
   # Deploy using Vercel CLI or GitHub integration
   ```

## Magento 2 Integration

Add this script tag to your product page templates:

```html
<script src="https://your-app.vercel.app/widget.js"></script>
```

The widget will automatically:
- Extract product specifications from the page
- Display a chat interface in the bottom-right corner
- Process customer questions using the Ask Ed AI assistant

## Configuration

### Environment Variables

- `OPENAI_API_KEY` - Your OpenAI API key (required)
- `ALLOWED_ORIGINS` - Comma-separated list of allowed domains (optional)

### Rate Limiting

- 5 messages per minute per IP
- 50 messages per day per IP
- 200-word maximum response length
- Input validation for security

### Security Features

- XSS and injection attack prevention
- Prompt injection blocking
- Content filtering for product-only discussions
- CORS configuration for safe embedding

## Ask Ed Personality

Ask Ed follows strict guidelines:
- Only answers questions about the current product
- Uses information from product specifications only
- Maintains professional electrical industry standards
- Defers to human experts for safety-critical questions
- Never discusses pricing or competitor products
- Provides accurate technical information with proper units

## API Endpoints

### POST /api/ask

Request:
```json
{
  "question": "What is the output voltage?",
  "productSpecs": "Model: ABC-123\nOutput: 12VDC...",
  "productTitle": "ABC-123 Power Supply"
}
```

Response:
```json
{
  "answer": "This power supply provides a 12VDC output..."
}
```

## Development

- Built with Next.js 14 and TypeScript
- Uses OpenAI GPT-3.5-turbo for responses
- Embedded widget with vanilla JavaScript
- Rate limiting with in-memory storage (use Redis in production)

## Production Considerations

1. Replace in-memory rate limiting with Redis/database
2. Add monitoring and logging
3. Configure proper CORS origins
4. Set up error tracking (Sentry, etc.)
5. Add analytics for usage monitoring

## Support

For technical questions about the chatbot, contact the development team.
For product questions, Ask Ed will direct users to Bravo Power Experts at 408-733-9090.