import Head from 'next/head';
import { useState } from 'react';

export default function Home() {
  const [testResult, setTestResult] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const testAPI = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/ask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          question: 'What is the output voltage of this power supply?',
          productSpecs: 'Model: ABC-123\nInput: 100-240VAC\nOutput: 12VDC, 5A\nPower: 60W\nEfficiency: 85%\nProtection: Short circuit, overcurrent',
          productTitle: 'ABC-123 60W Power Supply'
        })
      });
      
      const data = await response.json();
      setTestResult(data.error || data.answer);
    } catch (error) {
      setTestResult('Test failed: ' + error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Head>
        <title>Ask Ed Chatbot - Bravo Electro</title>
        <meta name="description" content="Ask Ed Product Q&A Chatbot for Bravo Electro" />
      </Head>

      <div style={{ padding: '40px', fontFamily: 'Arial, sans-serif', maxWidth: '800px', margin: '0 auto' }}>
        <h1 style={{ color: '#2c5aa0' }}>Ask Ed Chatbot</h1>
        <p>Product Q&A Assistant for Bravo Electro</p>

        <div style={{ 
          background: '#f8f9fa', 
          padding: '20px', 
          borderRadius: '8px', 
          marginTop: '20px' 
        }}>
          <h2>Integration Instructions</h2>
          <p>To add Ask Ed to your Magento product pages, add this code to your product template:</p>
          <pre style={{ 
            background: '#fff', 
            padding: '15px', 
            borderRadius: '4px', 
            overflow: 'auto',
            fontSize: '14px'
          }}>
{`<!-- Add to product page template -->
<script src="https://your-app.vercel.app/widget.js"></script>`}
          </pre>
          
          <h3>Setup Steps:</h3>
          <ol>
            <li>Deploy this app to Vercel</li>
            <li>Update the <code>WIDGET_API_BASE</code> URL in <code>public/widget.js</code></li>
            <li>Add your OpenAI API key to Vercel environment variables</li>
            <li>Add the script tag to your Magento product page templates</li>
          </ol>
        </div>

        <div style={{ marginTop: '20px' }}>
          <h3>API Test</h3>
          <button 
            onClick={testAPI} 
            disabled={loading}
            style={{
              background: '#2c5aa0',
              color: 'white',
              border: 'none',
              padding: '10px 20px',
              borderRadius: '4px',
              cursor: loading ? 'not-allowed' : 'pointer'
            }}
          >
            {loading ? 'Testing...' : 'Test Ask Ed API'}
          </button>
          
          {testResult && (
            <div style={{
              marginTop: '15px',
              padding: '15px',
              background: testResult.includes('error') ? '#ffebee' : '#e8f5e8',
              borderRadius: '4px',
              border: `1px solid ${testResult.includes('error') ? '#ffcdd2' : '#c8e6c8'}`
            }}>
              <strong>Response:</strong><br />
              {testResult}
            </div>
          )}
        </div>

        <div style={{ marginTop: '30px', fontSize: '14px', color: '#666' }}>
          <h3>Features Implemented:</h3>
          <ul>
            <li>✅ Ask Ed personality and safety guidelines</li>
            <li>✅ Rate limiting (5 messages/minute, 50/day per IP)</li>
            <li>✅ Input validation and security checks</li>
            <li>✅ Automatic product spec extraction from Magento pages</li>
            <li>✅ Professional chat widget design</li>
            <li>✅ 200-word response limit</li>
            <li>✅ Error handling and fallbacks</li>
          </ul>
        </div>
      </div>
    </>
  );
}