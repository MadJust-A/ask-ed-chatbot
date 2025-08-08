import { useState } from 'react';

export default function TestPage() {
  const [result, setResult] = useState('');
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
          question: 'What is the output voltage?',
          productSpecs: 'Model: ABC-123\nInput: 100-240VAC\nOutput: 12VDC, 5A\nPower: 60W',
          productTitle: 'ABC-123 Power Supply',
          // No datasheetUrl - test without PDF
        })
      });
      
      const data = await response.json();
      console.log('Response:', data);
      setResult(JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('Test error:', error);
      setResult('Error: ' + error);
    } finally {
      setLoading(false);
    }
  };

  const testWithPDF = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/ask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          question: 'What is the output voltage?',
          productSpecs: 'Model: ABC-123\nInput: 100-240VAC\nOutput: 12VDC, 5A\nPower: 60W',
          productTitle: 'ABC-123 Power Supply',
          datasheetUrl: 'https://example.com/fake.pdf', // This will fail but let's see the error
        })
      });
      
      const data = await response.json();
      console.log('Response with PDF:', data);
      setResult(JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('Test error:', error);
      setResult('Error: ' + error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '20px' }}>
      <h1>API Test Page</h1>
      
      <button onClick={testAPI} disabled={loading}>
        Test Without PDF
      </button>
      
      <button onClick={testWithPDF} disabled={loading} style={{ marginLeft: '10px' }}>
        Test With PDF (will fail)
      </button>
      
      <pre style={{ 
        background: '#f5f5f5', 
        padding: '20px', 
        marginTop: '20px',
        whiteSpace: 'pre-wrap'
      }}>
        {result || 'Click a button to test...'}
      </pre>
    </div>
  );
}