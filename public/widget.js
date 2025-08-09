(function() {
    'use strict';
    
    console.log('Ask Ed widget script loaded');
    
    // Configuration
    const WIDGET_API_BASE = 'https://ask-ed-chatbot.vercel.app';
    const WIDGET_ID = 'ask-ed-widget-' + Math.random().toString(36).substr(2, 9);
    
    // Prevent multiple initializations
    if (window.askEdInitialized) {
        console.log('Ask Ed already initialized, skipping');
        return;
    }
    window.askEdInitialized = true;
    console.log('Ask Ed initializing with ID:', WIDGET_ID);
    
    // Store the current script location
    const CURRENT_SCRIPT = document.currentScript || (function() {
        const scripts = document.getElementsByTagName('script');
        console.log('Found', scripts.length, 'scripts, using last one');
        return scripts[scripts.length - 1];
    })();
    
    console.log('Current script:', CURRENT_SCRIPT);
    console.log('Current script parent:', CURRENT_SCRIPT ? CURRENT_SCRIPT.parentNode : 'none');
    
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
        console.log('createWidget function called');
        const productInfo = extractProductInfo();
        console.log('Product info extracted:', productInfo);
        
        const widgetHTML = `
            <div id="${WIDGET_ID}" style="
                position: fixed;
                right: 20px;
                top: 50%;
                transform: translateY(-50%);
                z-index: 9999;
                font-family: Arial, sans-serif;
            ">
                <!-- Chat Window -->
                <div id="${WIDGET_ID}-chat" style="
                    position: absolute;
                    bottom: 80px;
                    right: 0;
                    width: 350px;
                    height: 350px;
                    background: white;
                    border: 1px solid #e0e0e0;
                    border-radius: 20px;
                    box-shadow: 0 10px 40px rgba(0,0,0,0.1), 0 0 0 1px rgba(0,0,0,0.05);
                    display: none;
                    flex-direction: column;
                    transform: translateY(20px);
                    opacity: 0;
                    transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
                ">
                    <!-- Header -->
                    <div style="
                        background: linear-gradient(135deg, #2c5aa0 0%, #3d6db0 100%);
                        color: white;
                        padding: 20px;
                        border-radius: 20px 20px 0 0;
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        position: relative;
                        overflow: hidden;
                    ">
                        <div style="
                            position: absolute;
                            top: -50%;
                            right: -10%;
                            width: 100px;
                            height: 100px;
                            background: rgba(255,255,255,0.1);
                            border-radius: 50%;
                        "></div>
                        <div style="display: flex; align-items: center; z-index: 1;">
                            <img src="${WIDGET_API_BASE}/ask-ed-logo.png" style="
                                width: 40px;
                                height: 40px;
                                margin-right: 16px;
                                filter: drop-shadow(0 2px 4px rgba(0,0,0,0.1));
                            ">
                            <div>
                                <div style="
                                    font-weight: 600; 
                                    font-size: 18px;
                                    letter-spacing: -0.5px;
                                    margin-bottom: 2px;
                                ">Ask Ed</div>
                                <div style="
                                    font-size: 13px; 
                                    opacity: 0.85;
                                    font-weight: 400;
                                ">Product Expert Assistant</div>
                            </div>
                        </div>
                        <button id="${WIDGET_ID}-close" style="
                            background: rgba(255,255,255,0.2);
                            border: none;
                            color: white;
                            font-size: 18px;
                            cursor: pointer;
                            padding: 8px;
                            width: 32px;
                            height: 32px;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            border-radius: 50%;
                            transition: all 0.2s ease;
                            z-index: 1;
                        ">×</button>
                    </div>
                    
                    <!-- Messages -->
                    <div id="${WIDGET_ID}-messages" style="
                        flex: 1;
                        padding: 20px;
                        overflow-y: auto;
                        background: #fafbfc;
                        min-height: 200px;
                        scrollbar-width: thin;
                        scrollbar-color: #cbd5e0 transparent;
                    ">
                        <div style="
                            background: linear-gradient(135deg, #e3f2fd 0%, #f0f7ff 100%);
                            padding: 16px;
                            border-radius: 12px;
                            margin-bottom: 16px;
                            font-size: 14px;
                            line-height: 1.5;
                            border-left: 4px solid #2c5aa0;
                            box-shadow: 0 2px 8px rgba(44, 90, 160, 0.1);
                        ">
                            👋 Hi! I'm Ask Ed, your Bravo Electro product expert. Ask me anything about this product's specifications, features, or compatibility!
                        </div>
                    </div>
                    
                    <!-- Input -->
                    <div style="
                        padding: 20px;
                        border-top: 1px solid #e8eaed;
                        background: white;
                        border-radius: 0 0 20px 20px;
                    ">
                        <div style="display: flex; gap: 12px; align-items: flex-end;">
                            <input id="${WIDGET_ID}-chat-input" type="text" placeholder="Continue the conversation..." style="
                                flex: 1;
                                padding: 12px 16px;
                                border: 2px solid #e8eaed;
                                border-radius: 12px;
                                font-size: 14px;
                                outline: none;
                                transition: border-color 0.2s ease;
                                font-family: inherit;
                                background: #fafbfc;
                            ">
                            <button id="${WIDGET_ID}-chat-send" style="
                                background: linear-gradient(135deg, #2c5aa0 0%, #3d6db0 100%);
                                color: white;
                                border: none;
                                padding: 12px 20px;
                                border-radius: 12px;
                                cursor: pointer;
                                font-size: 14px;
                                font-weight: 600;
                                transition: all 0.2s ease;
                                box-shadow: 0 2px 8px rgba(44, 90, 160, 0.3);
                            ">Send</button>
                        </div>
                    </div>
                </div>
                
                <!-- Search Bar -->
                <div id="${WIDGET_ID}-searchbar" style="
                    position: absolute;
                    bottom: 20px;
                    right: 110px;
                    width: 0;
                    height: 50px;
                    background: white;
                    border: none;
                    border-radius: 25px;
                    box-shadow: 0 2px 15px rgba(0,0,0,0.15);
                    overflow: hidden;
                    transition: all 0.3s ease-in-out;
                    display: flex;
                    align-items: center;
                    padding: 0;
                    opacity: 0;
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
                
                <!-- Welcome Bubble -->
                <div id="${WIDGET_ID}-welcome" style="
                    position: absolute;
                    bottom: 20px;
                    right: 120px;
                    max-width: 350px;
                    background: white;
                    border: 1px solid #e0e0e0;
                    border-radius: 16px;
                    box-shadow: 0 4px 20px rgba(0,0,0,0.15);
                    padding: 16px;
                    font-size: 14px;
                    line-height: 1.4;
                    opacity: 0;
                    transform: translateX(20px);
                    transition: all 0.4s ease;
                    pointer-events: none;
                ">
                    <div style="
                        display: flex;
                        align-items: center;
                        margin-bottom: 8px;
                    ">
                        <img src="${WIDGET_API_BASE}/ask-ed-logo.png" style="
                            width: 24px;
                            height: 24px;
                            margin-right: 10px;
                        ">
                        <strong style="color: #2c5aa0;">Ask Ed</strong>
                    </div>
                    <div id="${WIDGET_ID}-welcome-text">Ask me questions about this product!</div>
                    <!-- Speech bubble arrow -->
                    <div style="
                        position: absolute;
                        top: 50%;
                        right: -8px;
                        transform: translateY(-50%);
                        width: 0;
                        height: 0;
                        border-left: 8px solid white;
                        border-top: 8px solid transparent;
                        border-bottom: 8px solid transparent;
                    "></div>
                    <div style="
                        position: absolute;
                        top: 50%;
                        right: -9px;
                        transform: translateY(-50%);
                        width: 0;
                        height: 0;
                        border-left: 9px solid #e0e0e0;
                        border-top: 9px solid transparent;
                        border-bottom: 9px solid transparent;
                    "></div>
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
        
        // Add widget to body with fixed positioning (sticky left side, middle of page)
        document.body.insertAdjacentHTML('beforeend', widgetHTML);
        console.log('Ask Ed widget placed in document body with fixed positioning (left side, middle)');
        
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
        const welcome = document.getElementById(`${WIDGET_ID}-welcome`);
        const welcomeText = document.getElementById(`${WIDGET_ID}-welcome-text`);
        
        let isSearchOpen = false;
        let isChatOpen = false;
        let welcomeShown = false;
        
        // Update welcome text with product name
        const productName = productInfo.title ? 
            productInfo.title.split(' ').slice(0, 3).join(' ') : 'this product';
        welcomeText.textContent = `Ask me questions about the ${productName}!`;
        
        // Show welcome bubble after a delay
        setTimeout(() => {
            if (!welcomeShown && !isSearchOpen && !isChatOpen) {
                welcome.style.opacity = '1';
                welcome.style.transform = 'translateX(0)';
                welcomeShown = true;
                
                // Auto-hide welcome bubble after 5 seconds
                setTimeout(() => {
                    if (welcomeShown && !isSearchOpen && !isChatOpen) {
                        welcome.style.opacity = '0';
                        welcome.style.transform = 'translateX(20px)';
                    }
                }, 5000);
            }
        }, 2000);
        
        // Click logo → toggle search bar
        toggle.onclick = (e) => {
            e.stopPropagation();
            if (!isSearchOpen) {
                // Hide welcome bubble
                welcome.style.opacity = '0';
                welcome.style.transform = 'translateX(20px)';
                
                // Open search bar
                searchbar.style.width = '300px';
                searchbar.style.opacity = '1';
                searchbar.style.border = '1px solid #ddd';
                send.style.opacity = '1';
                setTimeout(() => input.focus(), 300);
                isSearchOpen = true;
                toggle.style.transform = 'scale(1.1)';
            } else {
                // Close search bar
                searchbar.style.width = '0';
                searchbar.style.opacity = '0';
                searchbar.style.border = 'none';
                send.style.opacity = '0';
                isSearchOpen = false;
                toggle.style.transform = 'scale(1)';
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
                    searchbar.style.opacity = '0';
                    searchbar.style.border = 'none';
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
                margin-bottom: 16px;
                padding: 14px 18px;
                font-size: 14px;
                line-height: 1.5;
                max-width: 85%;
                animation: slideIn 0.3s ease-out;
                ${isUser ? 
                    `background: linear-gradient(135deg, #2c5aa0 0%, #3d6db0 100%); 
                     color: white; 
                     margin-left: auto; 
                     margin-right: 0;
                     border-radius: 18px 18px 4px 18px;
                     box-shadow: 0 2px 12px rgba(44, 90, 160, 0.3);` : 
                    `background: white; 
                     color: #2d3748;
                     margin-left: 0;
                     margin-right: auto;
                     border-radius: 18px 18px 18px 4px;
                     border: 1px solid #e2e8f0;
                     box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);`
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
            searchbar.style.opacity = '0';
            searchbar.style.border = 'none';
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
    console.log('Document ready state:', document.readyState);
    if (document.readyState === 'loading') {
        console.log('Waiting for DOM to load...');
        document.addEventListener('DOMContentLoaded', function() {
            console.log('DOM loaded, creating widget');
            createWidget();
        });
    } else {
        console.log('DOM already loaded, creating widget immediately');
        createWidget();
    }
})();