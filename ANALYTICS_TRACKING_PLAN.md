# Ask ED Widget Analytics & SEO Tracking Implementation Plan

## Overview
This document outlines how to implement comprehensive analytics tracking for the Ask ED widget to gain SEO insights and optimize user experience.

## 1. Google Analytics 4 Event Tracking

### Core Events to Implement

#### Widget Interaction Events
```javascript
// Add to widget.js - Track widget opens
gtag('event', 'ask_ed_widget_opened', {
  event_category: 'Ask_ED_Widget',
  event_action: 'widget_opened',
  event_label: productInfo.title,
  page_path: window.location.pathname,
  product_name: productInfo.title
});

// Track when slider opens
gtag('event', 'ask_ed_slider_opened', {
  event_category: 'Ask_ED_Widget',
  event_action: 'slider_opened',
  event_label: productInfo.title
});

// Track question submissions
gtag('event', 'ask_ed_question_submitted', {
  event_category: 'Ask_ED_Widget',
  event_action: 'question_submitted',
  event_label: productInfo.title,
  custom_parameters: {
    product_name: productInfo.title,
    question_length: question.length,
    question_category: categorizeQuestion(question),
    has_datasheet: !!productInfo.datasheetUrl,
    user_session_id: generateSessionId()
  }
});

// Track successful responses
gtag('event', 'ask_ed_response_received', {
  event_category: 'Ask_ED_Widget',
  event_action: 'response_received',
  event_label: productInfo.title,
  custom_parameters: {
    response_length: data.answer.length,
    response_time_ms: responseTime,
    contains_links: data.answer.includes('<a href'),
    product_name: productInfo.title
  }
});

// Track errors
gtag('event', 'ask_ed_error', {
  event_category: 'Ask_ED_Widget',
  event_action: 'error_occurred',
  event_label: error.message,
  error_type: error.type
});
```

#### User Behavior Events
```javascript
// Track time spent with widget open
gtag('event', 'ask_ed_engagement_time', {
  event_category: 'Ask_ED_Widget',
  event_action: 'time_spent',
  value: timeSpentSeconds,
  product_name: productInfo.title
});

// Track conversation length
gtag('event', 'ask_ed_conversation_length', {
  event_category: 'Ask_ED_Widget',
  event_action: 'conversation_ended',
  value: messageCount,
  session_duration: sessionDuration
});
```

## 2. Question Categorization Function

```javascript
function categorizeQuestion(question) {
  const q = question.toLowerCase();
  
  // Pricing related
  if (q.match(/price|cost|pricing|expensive|cheap|budget/)) return 'pricing';
  
  // Technical specifications
  if (q.match(/spec|specification|voltage|current|power|watt|amp|dimension|size|weight/)) return 'specifications';
  
  // Compatibility
  if (q.match(/compatible|work with|fit|connect|interface|support/)) return 'compatibility';
  
  // Installation/Setup
  if (q.match(/install|setup|connect|wire|mount|configure/)) return 'installation';
  
  // Availability/Stock
  if (q.match(/stock|available|inventory|delivery|ship|lead time/)) return 'availability';
  
  // Comparison
  if (q.match(/vs|versus|compare|difference|better|alternative/)) return 'comparison';
  
  // Troubleshooting
  if (q.match(/problem|issue|error|trouble|fix|broken|not working/)) return 'troubleshooting';
  
  // Features/Capabilities
  if (q.match(/feature|capability|can it|does it|function/)) return 'features';
  
  return 'general';
}
```

## 3. Session Tracking

```javascript
function generateSessionId() {
  if (!sessionStorage.getItem('ask_ed_session_id')) {
    sessionStorage.setItem('ask_ed_session_id', 
      'ask_ed_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)
    );
  }
  return sessionStorage.getItem('ask_ed_session_id');
}

function trackSessionMetrics() {
  const sessionStart = sessionStorage.getItem('ask_ed_session_start') || Date.now();
  const currentTime = Date.now();
  const sessionDuration = Math.round((currentTime - sessionStart) / 1000);
  
  return {
    session_id: generateSessionId(),
    session_duration: sessionDuration,
    questions_asked: sessionStorage.getItem('ask_ed_questions_count') || 0
  };
}
```

## 4. Key Metrics to Track

### User Engagement Metrics
- **Widget Open Rate**: % of page visitors who interact with widget
- **Question Submission Rate**: % of widget openers who ask questions
- **Conversation Length**: Average number of questions per session
- **Time on Page**: Before/after widget interaction
- **Bounce Rate**: Comparison with/without widget usage
- **Return Visitors**: Users who come back to same product pages

### Product-Specific Insights
- **Most Asked Questions by Product**: Identify unclear product info
- **High-Question Products**: Products needing better descriptions
- **Question Categories by Product Type**: Different concerns for different products
- **Datasheet Click-through Rate**: How often users need additional info

### SEO Performance Indicators
- **Page Engagement Metrics**: Time on page, scroll depth, interactions
- **Search Performance**: Rankings correlation with widget usage
- **Content Gap Identification**: Common questions = missing content opportunities
- **User Satisfaction Signals**: Longer sessions, lower bounce rates

## 5. Implementation Locations

### In processMessage() function:
```javascript
// Add after successful API call
const responseTime = Date.now() - requestStartTime;
if (typeof gtag !== 'undefined') {
  gtag('event', 'ask_ed_question_answered', {
    event_category: 'Ask_ED_Widget',
    event_action: 'successful_interaction',
    event_label: productInfo.title,
    custom_parameters: {
      question_category: categorizeQuestion(question),
      response_time_ms: responseTime,
      response_helpful: true, // Could add user feedback later
      ...trackSessionMetrics()
    }
  });
}
```

### In toggle click handler:
```javascript
// Add when widget opens
if (typeof gtag !== 'undefined') {
  gtag('event', 'ask_ed_widget_opened', {
    event_category: 'Ask_ED_Widget',
    event_action: 'widget_opened',
    event_label: productInfo.title
  });
}
```

## 6. Advanced Tracking Options

### A/B Testing Setup
- **Widget Position**: Right side vs bottom vs left
- **Color Schemes**: Current blue/yellow vs alternatives
- **Call-to-Action Text**: Different prompt variations
- **Logo Glow Effects**: With/without glow comparison

### Heat Mapping Integration
```javascript
// For Hotjar or similar
if (typeof hj !== 'undefined') {
  hj('trigger', 'ask_ed_widget_interaction');
}
```

### Conversion Tracking
```javascript
// Track if widget users are more likely to convert
gtag('event', 'ask_ed_user_profile', {
  event_category: 'Ask_ED_Widget',
  user_segment: 'widget_user',
  product_category: getProductCategory(productInfo.title),
  session_value: calculateSessionValue()
});
```

## 7. Data Analysis & SEO Insights

### Weekly Reports to Generate:
1. **Top 10 Most Asked Questions** → Create FAQ content
2. **Products with Highest Question Volume** → Need description improvements
3. **Question Categories by Product Type** → Content strategy insights
4. **Widget Usage vs Page Performance** → SEO correlation analysis
5. **User Journey Analysis** → How widget affects customer path

### SEO Action Items from Data:
- **Content Creation**: FAQ pages from common questions
- **Product Description Updates**: Address frequently asked questions
- **Schema Markup**: Add FAQ schema for common questions
- **Internal Linking**: Connect related products based on comparison questions
- **Meta Description Updates**: Include answers to top questions

## 8. Privacy Considerations

### GDPR/CCPA Compliance:
```javascript
// Check for consent before tracking
function trackEvent(eventName, parameters) {
  if (hasUserConsent() && typeof gtag !== 'undefined') {
    gtag('event', eventName, parameters);
  }
}

function hasUserConsent() {
  // Check your consent management platform
  return window.dataLayer && window.dataLayer.find(item => 
    item.event === 'consent_given' || item.consent_analytics === 'granted'
  );
}
```

## 9. Implementation Phases

### Phase 1: Basic Tracking
- Widget open/close events
- Question submissions
- Response success/failure
- Basic categorization

### Phase 2: Advanced Analytics  
- Session tracking
- Question categorization
- Response time tracking
- User behavior patterns

### Phase 3: SEO Integration
- Content gap analysis
- Search performance correlation
- Conversion tracking
- A/B testing setup

## 10. Expected ROI

### SEO Benefits:
- **Improved User Signals**: Longer time on page, lower bounce rate
- **Content Optimization**: Data-driven FAQ and description improvements
- **Featured Snippets**: Common questions → structured data opportunities
- **User Experience**: Better UX = better rankings

### Business Benefits:
- **Reduced Support Tickets**: Self-service answers
- **Higher Conversion**: Better-informed customers
- **Product Development**: Customer pain point insights
- **Competitive Advantage**: Better product information than competitors

---

**Next Steps**: When ready to implement, start with Phase 1 basic tracking and gradually add more sophisticated analytics based on initial data insights.