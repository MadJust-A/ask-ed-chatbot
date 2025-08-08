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
    
    // Store the current script location
    const CURRENT_SCRIPT = document.currentScript || (function() {
        const scripts = document.getElementsByTagName('script');
        return scripts[scripts.length - 1];
    })();
    
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
                display: inline-block;
                position: relative;
                z-index: 9999;
                font-family: Arial, sans-serif;
            ">
                <!-- Chat Window -->
                <div id="${WIDGET_ID}-chat" style="
                    position: absolute;
                    bottom: 110px;
                    left: 0;
                    width: 400px;
                    height: 500px;
                    background: white;
                    border: 1px solid #ddd;
                    border-radius: 16px;
                    box-shadow: 0 8px 30px rgba(0,0,0,0.15);
                    display: none;
                    flex-direction: column;
                    transform: translateY(10px);
                    opacity: 0;
                    transition: all 0.3s ease;
                ">
                    <!-- Header -->
                    <div style="
                        background: #2c5aa0;
                        color: white;
                        padding: 16px;
                        border-radius: 16px 16px 0 0;
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                    ">
                        <div style="display: flex; align-items: center;">
                            <img src="${WIDGET_API_BASE}/ask-ed-logo.png" style="
                                width: 32px;
                                height: 32px;
                                margin-right: 12px;
                            ">
                            <div>
                                <div style="font-weight: bold; font-size: 16px;">Ask Ed</div>
                                <div style="font-size: 12px; opacity: 0.9;">Product Q&A Assistant</div>
                            </div>
                        </div>
                        <button id="${WIDGET_ID}-close" style="
                            background: none;
                            border: none;
                            color: white;
                            font-size: 20px;
                            cursor: pointer;
                            padding: 4px;
                            width: 28px;
                            height: 28px;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            border-radius: 4px;
                        ">×</button>
                    </div>
                    
                    <!-- Messages -->
                    <div id="${WIDGET_ID}-messages" style="
                        flex: 1;
                        padding: 16px;
                        overflow-y: auto;
                        background: #f8f9fa;
                        min-height: 300px;
                    ">
                        <div style="
                            background: #e3f2fd;
                            padding: 12px;
                            border-radius: 8px;
                            margin-bottom: 12px;
                            font-size: 14px;
                        ">
                            Hi! I'm Ask Ed, your Bravo Electro product assistant. Ask me anything about this product's specifications!
                        </div>
                    </div>
                    
                    <!-- Input -->
                    <div style="
                        padding: 16px;
                        border-top: 1px solid #eee;
                        background: white;
                        border-radius: 0 0 16px 16px;
                    ">
                        <div style="display: flex; gap: 8px;">
                            <input id="${WIDGET_ID}-chat-input" type="text" placeholder="Ask about specs, features, compatibility..." style="
                                flex: 1;
                                padding: 10px 14px;
                                border: 1px solid #ddd;
                                border-radius: 8px;
                                font-size: 14px;
                                outline: none;
                            ">
                            <button id="${WIDGET_ID}-chat-send" style="
                                background: #2c5aa0;
                                color: white;
                                border: none;
                                padding: 10px 18px;
                                border-radius: 8px;
                                cursor: pointer;
                                font-size: 14px;
                                font-weight: 500;
                            ">Send</button>
                        </div>
                    </div>
                </div>
                
                <!-- Search Bar -->
                <div id="${WIDGET_ID}-searchbar" style="
                    position: absolute;
                    bottom: 20px;
                    left: 120px;
                    width: 0;
                    height: 50px;
                    background: white;
                    border: 1px solid #ddd;
                    border-radius: 25px;
                    box-shadow: 0 2px 15px rgba(0,0,0,0.15);
                    overflow: hidden;
                    transition: width 0.3s ease-in-out;
                    display: flex;
                    align-items: center;
                    padding: 0;
                ">
                    <input id="${WIDGET_ID}-input" type="text" placeholder="Ask about this product..." style="
                        flex: 1;
                        border: none;
                        outline: none;
                        padding: 12px 20px;
                        font-size: 14px;
                        background: transparent;
                        min-width: 0;
                    ">
                    <button id="${WIDGET_ID}-send" style="
                        background: #2c5aa0;
                        color: white;
                        border: none;
                        width: 35px;
                        height: 35px;
                        border-radius: 50%;
                        cursor: pointer;
                        font-size: 16px;
                        margin-right: 8px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        opacity: 0;
                        transition: opacity 0.3s ease;
                    ">?</button>
                </div>
                
                <!-- Logo Button -->
                <img id="${WIDGET_ID}-toggle" src="${WIDGET_API_BASE}/ask-ed-logo.png" style="
                    width: 100px;
                    height: auto;
                    cursor: pointer;
                    transition: all 0.3s ease;
                    display: block;
                ">
            </div>
        `;
        
        // Use the stored script reference to place widget exactly where script is
        if (CURRENT_SCRIPT && CURRENT_SCRIPT.parentNode) {
            CURRENT_SCRIPT.insertAdjacentHTML('afterend', widgetHTML);
            console.log('Ask Ed widget placed after script in:', CURRENT_SCRIPT.parentNode);
        } else {
            // Fallback: append to body (should rarely happen)
            document.body.insertAdjacentHTML('beforeend', widgetHTML);
            console.log('Ask Ed widget placed in document body (fallback)');
        }
        
        // Event listeners
        setupEventListeners(productInfo);
    }
    
    function setupEventListeners(productInfo) {
        const toggle = document.getElementById(`${WIDGET_ID}-toggle`);
        const searchbar = document.getElementById(`${WIDGET_ID}-searchbar`);
        const chat = document.getElementById(`${WIDGET_ID}-chat`);
        const close = document.getElementById(`${WIDGET_ID}-close`);
        const input = document.getElementById(`${WIDGET_ID}-input`);
        const send = document.getElementById(`${WIDGET_ID}-send`);
        const chatInput = document.getElementById(`${WIDGET_ID}-chat-input`);
        const chatSend = document.getElementById(`${WIDGET_ID}-chat-send`);
        const messages = document.getElementById(`${WIDGET_ID}-messages`);
        
        let isSearchOpen = false;
        let isChatOpen = false;
        
        // Click logo → open search bar
        toggle.onclick = (e) => {
            e.stopPropagation();
            if (!isSearchOpen) {
                searchbar.style.width = '300px';
                send.style.opacity = '1';
                setTimeout(() => input.focus(), 300);
                isSearchOpen = true;
                toggle.style.transform = 'scale(1.1)';
            }
        };
        
        // Close chat window
        close.onclick = () => {
            chat.style.transform = 'translateY(10px)';
            chat.style.opacity = '0';
            setTimeout(() => {
                chat.style.display = 'none';
            }, 300);
            isChatOpen = false;
        };
        
        // Close search/chat when clicking outside
        document.addEventListener('click', (e) => {
            if (!document.getElementById(WIDGET_ID).contains(e.target)) {
                if (isSearchOpen) {
                    searchbar.style.width = '0';
                    send.style.opacity = '0';
                    isSearchOpen = false;
                    toggle.style.transform = 'scale(1)';
                }
                if (isChatOpen) {
                    chat.style.transform = 'translateY(10px)';
                    chat.style.opacity = '0';
                    setTimeout(() => {
                        chat.style.display = 'none';
                    }, 300);
                    isChatOpen = false;
                }
            }
        });
        
        // Search bar input handlers
        input.onkeypress = (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        };
        
        send.onclick = sendMessage;
        
        // Chat window input handlers  
        chatInput.onkeypress = (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendChatMessage();
            }
        };
        
        chatSend.onclick = sendChatMessage;
        
        function addMessage(content, isUser = false) {
            const messageDiv = document.createElement('div');
            messageDiv.style.cssText = `
                margin-bottom: 12px;
                padding: 12px;
                border-radius: 8px;
                font-size: 14px;
                line-height: 1.4;
                ${isUser ? 
                    'background: #2c5aa0; color: white; margin-left: 40px; border-radius: 8px 8px 4px 8px;' : 
                    'background: white; border: 1px solid #e0e0e0; margin-right: 40px; border-radius: 8px 8px 8px 4px;'
                }
            `;
            messageDiv.innerHTML = content.replace(/\n/g, '<br>');
            messages.appendChild(messageDiv);
            messages.scrollTop = messages.scrollHeight;
        }
        
        // Search bar submission → opens chat with first message
        async function sendMessage() {
            const question = input.value.trim();
            if (!question) return;
            
            // Open chat window
            chat.style.display = 'flex';
            setTimeout(() => {
                chat.style.transform = 'translateY(0)';
                chat.style.opacity = '1';
            }, 10);
            isChatOpen = true;
            
            // Add user message to chat
            addMessage(question, true);
            
            // Clear and hide search bar
            input.value = '';
            searchbar.style.width = '0';
            send.style.opacity = '0';
            isSearchOpen = false;
            toggle.style.transform = 'scale(1)';
            
            // Send to API
            await processMessage(question);
        }
        
        // Chat window submission → continues conversation
        async function sendChatMessage() {
            const question = chatInput.value.trim();
            if (!question) return;
            
            addMessage(question, true);
            chatInput.value = '';
            await processMessage(question);
        }
        
        // Actual API call function
        async function processMessage(question) {
            const sendButton = isChatOpen ? chatSend : send;
            const originalText = sendButton.textContent;
            
            sendButton.disabled = true;
            sendButton.textContent = 'Sending...';
            
            try {
                console.log('Sending request to:', `${WIDGET_API_BASE}/api/ask`);
                console.log('Request data:', {
                    question: question,
                    productSpecs: productInfo.specs,
                    productTitle: productInfo.title,
                    datasheetUrl: productInfo.datasheetUrl
                });
                
                const apiResponse = await fetch(`${WIDGET_API_BASE}/api/ask`, {
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
                
                console.log('Response status:', apiResponse.status);
                const data = await apiResponse.json();
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
                sendButton.disabled = false;
                sendButton.textContent = originalText;
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