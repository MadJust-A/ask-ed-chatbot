(function() {
    'use strict';
    
    // Configuration
    const WIDGET_API_BASE = 'https://ask-ed-chatbot.vercel.app';
    const WIDGET_ID = 'ask-ed-widget-' + Math.random().toString(36).substr(2, 9);
    
    // Prevent multiple initializations
    if (window.askEdInitialized) {
        return;
    }
    window.askEdInitialized = true;
    
    // Extract product information from Magento page
    function extractProductInfo() {
        // Try multiple selectors commonly used in Magento
        const title = document.querySelector('.page-title-wrapper h1')?.textContent?.trim() ||
                     document.querySelector('.product-item-name')?.textContent?.trim() ||
                     document.querySelector('h1')?.textContent?.trim() ||
                     document.title;
                     
        // Look for datasheet PDF links
        let datasheetUrl = null;
        const datasheetLinks = document.querySelectorAll('a[href*=".pdf"], a[href*="datasheet"], a[href*="spec"]');
        datasheetLinks.forEach(link => {
            const href = link.href;
            const text = link.textContent.toLowerCase();
            if ((href.includes('.pdf') || text.includes('datasheet') || text.includes('spec')) && 
                !datasheetUrl) {
                datasheetUrl = href;
            }
        });
        
        // Extract specifications from various common locations
        let specs = '';
        
        // Try product attribute tables
        const specTable = document.querySelector('.data-table tbody') ||
                         document.querySelector('.product-info-main .additional-attributes tbody') ||
                         document.querySelector('.product-specs tbody');
                         
        if (specTable) {
            const rows = specTable.querySelectorAll('tr');
            rows.forEach(row => {
                const cells = row.querySelectorAll('td, th');
                if (cells.length >= 2) {
                    specs += cells[0].textContent.trim() + ': ' + cells[1].textContent.trim() + '\n';
                }
            });
        }
        
        // Try product description sections
        if (!specs) {
            const description = document.querySelector('.product.info.detailed .description') ||
                              document.querySelector('.product-info-main .product-description') ||
                              document.querySelector('.product.attribute.overview');
            if (description) {
                specs = description.textContent.trim();
            }
        }
        
        // Fallback to any visible product information
        if (!specs) {
            const productInfo = document.querySelector('.product-info-main');
            if (productInfo) {
                specs = productInfo.textContent.trim().substring(0, 2000); // Limit length
            }
        }
        
        return {
            title: title || 'Product',
            specs: specs || 'No specifications available',
            datasheetUrl: datasheetUrl
        };
    }
    
    // Create widget HTML
    function createWidget() {
        const productInfo = extractProductInfo();
        
        const widgetHTML = `
            <div id="${WIDGET_ID}" style="
                position: fixed;
                bottom: 20px;
                right: 20px;
                z-index: 9999;
                font-family: Arial, sans-serif;
            ">
                <div id="${WIDGET_ID}-chat" style="
                    width: 350px;
                    height: 450px;
                    background: white;
                    border: 1px solid #ddd;
                    border-radius: 12px;
                    box-shadow: 0 4px 20px rgba(0,0,0,0.15);
                    display: none;
                    flex-direction: column;
                ">
                    <!-- Header -->
                    <div style="
                        background: #2c5aa0;
                        color: white;
                        padding: 16px;
                        border-radius: 12px 12px 0 0;
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                    ">
                        <div>
                            <div style="font-weight: bold; font-size: 16px;">Ask Ed</div>
                            <div style="font-size: 12px; opacity: 0.9;">Product Q&A Assistant</div>
                        </div>
                        <button id="${WIDGET_ID}-close" style="
                            background: none;
                            border: none;
                            color: white;
                            font-size: 20px;
                            cursor: pointer;
                            padding: 4px;
                        ">×</button>
                    </div>
                    
                    <!-- Messages -->
                    <div id="${WIDGET_ID}-messages" style="
                        flex: 1;
                        padding: 16px;
                        overflow-y: auto;
                        background: #f8f9fa;
                    ">
                        <div style="
                            background: #e3f2fd;
                            padding: 12px;
                            border-radius: 8px;
                            margin-bottom: 12px;
                            font-size: 14px;
                        ">
                            Hi! I'm Ask Ed, your Bravo Electro product assistant. Ask me anything about this ${productInfo.title.split(' ')[0]} power supply's specifications!
                        </div>
                    </div>
                    
                    <!-- Input -->
                    <div style="
                        padding: 16px;
                        border-top: 1px solid #eee;
                        background: white;
                        border-radius: 0 0 12px 12px;
                    ">
                        <div style="display: flex; gap: 8px;">
                            <input id="${WIDGET_ID}-input" type="text" placeholder="Ask about specs, features, compatibility..." style="
                                flex: 1;
                                padding: 8px 12px;
                                border: 1px solid #ddd;
                                border-radius: 6px;
                                font-size: 14px;
                                outline: none;
                            ">
                            <button id="${WIDGET_ID}-send" style="
                                background: #2c5aa0;
                                color: white;
                                border: none;
                                padding: 8px 16px;
                                border-radius: 6px;
                                cursor: pointer;
                                font-size: 14px;
                            ">Send</button>
                        </div>
                    </div>
                </div>
                
                <!-- Toggle Button -->
                <button id="${WIDGET_ID}-toggle" style="
                    width: 60px;
                    height: 60px;
                    border-radius: 50%;
                    background: #2c5aa0;
                    color: white;
                    border: none;
                    cursor: pointer;
                    font-size: 24px;
                    box-shadow: 0 2px 10px rgba(0,0,0,0.2);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin-left: auto;
                    margin-top: 8px;
                ">💬</button>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', widgetHTML);
        
        // Event listeners
        setupEventListeners(productInfo);
    }
    
    function setupEventListeners(productInfo) {
        const toggle = document.getElementById(`${WIDGET_ID}-toggle`);
        const chat = document.getElementById(`${WIDGET_ID}-chat`);
        const close = document.getElementById(`${WIDGET_ID}-close`);
        const input = document.getElementById(`${WIDGET_ID}-input`);
        const send = document.getElementById(`${WIDGET_ID}-send`);
        const messages = document.getElementById(`${WIDGET_ID}-messages`);
        
        toggle.onclick = () => {
            chat.style.display = chat.style.display === 'none' ? 'flex' : 'none';
            if (chat.style.display === 'flex') {
                input.focus();
            }
        };
        
        close.onclick = () => {
            chat.style.display = 'none';
        };
        
        input.onkeypress = (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        };
        
        send.onclick = sendMessage;
        
        function addMessage(content, isUser = false) {
            const messageDiv = document.createElement('div');
            messageDiv.style.cssText = `
                margin-bottom: 12px;
                padding: 12px;
                border-radius: 8px;
                font-size: 14px;
                line-height: 1.4;
                ${isUser ? 
                    'background: #2c5aa0; color: white; margin-left: 40px;' : 
                    'background: white; border: 1px solid #e0e0e0; margin-right: 40px;'
                }
            `;
            messageDiv.innerHTML = content.replace(/\n/g, '<br>');
            messages.appendChild(messageDiv);
            messages.scrollTop = messages.scrollHeight;
        }
        
        async function sendMessage() {
            const question = input.value.trim();
            if (!question) return;
            
            addMessage(question, true);
            input.value = '';
            send.disabled = true;
            send.textContent = '...';
            
            try {
                console.log('Sending request to:', `${WIDGET_API_BASE}/api/ask`);
                console.log('Request data:', {
                    question: question,
                    productSpecs: productInfo.specs,
                    productTitle: productInfo.title,
                    datasheetUrl: productInfo.datasheetUrl
                });
                
                const response = await fetch(`${WIDGET_API_BASE}/api/ask`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        question: question,
                        productSpecs: productInfo.specs,
                        productTitle: productInfo.title,
                        datasheetUrl: productInfo.datasheetUrl
                    })
                });
                
                console.log('Response status:', response.status);
                const data = await response.json();
                console.log('Response data:', data);
                
                if (data.error) {
                    addMessage(`Sorry, ${data.error}`, false);
                } else {
                    addMessage(data.answer || 'No answer received', false);
                }
                
            } catch (error) {
                console.error('Ask Ed error:', error);
                addMessage('Sorry, I\'m experiencing technical difficulties. Please contact a Bravo Power Expert via web chat or call 408-733-9090.', false);
            } finally {
                send.disabled = false;
                send.textContent = 'Send';
            }
        }
    }
    
    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', createWidget);
    } else {
        createWidget();
    }
})();