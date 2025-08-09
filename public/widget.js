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
        console.log('Extracting product information...');
        
        // Try multiple selectors commonly used in Magento
        const title = document.querySelector('.page-title-wrapper h1')?.textContent?.trim() ||
                     document.querySelector('.product-item-name')?.textContent?.trim() ||
                     document.querySelector('h1')?.textContent?.trim() ||
                     document.title;
        
        console.log('Product title:', title);
                     
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
        
        console.log('Found datasheet URL:', datasheetUrl);
        
        // Extract specifications from various locations with better selectors
        let specs = '';
        
        // Try multiple specification table selectors for Magento/Bravo Electro pages
        const specSelectors = [
            '.data-table tbody',
            '.product-info-main .additional-attributes tbody',
            '.product-specs tbody',
            'table.data-table tbody',
            '.product-attribute-specs tbody',
            '.specification-table tbody',
            '.specs-table tbody',
            '.product-specs-table tbody',
            '.additional-attributes-table tbody',
            '.product-info-main table tbody',
            '.product-collateral table tbody',
            '.tab-content table tbody',
            '#product-attribute-specs-table tbody',
            '[data-role="content"] table tbody',
            '.product-specs-wrapper table tbody'
        ];
        
        let specTable = null;
        for (const selector of specSelectors) {
            specTable = document.querySelector(selector);
            if (specTable) {
                console.log('Found specs table with selector:', selector);
                break;
            }
        }
        
        if (specTable) {
            const rows = specTable.querySelectorAll('tr');
            console.log('Found', rows.length, 'specification rows');
            rows.forEach((row, index) => {
                const cells = row.querySelectorAll('td, th');
                if (cells.length >= 2) {
                    const label = cells[0].textContent.trim();
                    const value = cells[1].textContent.trim();
                    if (label && value) {
                        specs += label + ': ' + value + '\n';
                        console.log(`Row ${index}: ${label} = ${value}`);
                    }
                }
            });
        }
        
        // Also try to find specifications in div structures
        if (!specs) {
            const specDivs = document.querySelectorAll('.product-info-main .product-specs div, .specification div, .specs div');
            specDivs.forEach(div => {
                const text = div.textContent.trim();
                if (text && text.includes(':')) {
                    specs += text + '\n';
                }
            });
        }
        
        // Try product description sections with more selectors for Magento
        if (!specs) {
            const descriptionSelectors = [
                '.product.info.detailed .description',
                '.product-info-main .product-description',
                '.product.attribute.overview',
                '.product-details',
                '.product-specifications',
                '.tab-content .description',
                '.product.info.detailed .value',
                '.short-description .std',
                '.product-info-main .short-description',
                '[data-role="content"] .value',
                '.product-view .std',
                '.product.attribute.description .value'
            ];
            
            for (const selector of descriptionSelectors) {
                const description = document.querySelector(selector);
                if (description) {
                    specs = description.textContent.trim();
                    console.log('Found specs in description with selector:', selector);
                    break;
                }
            }
        }
        
        // Look for any tables on the page that might contain specs
        if (!specs) {
            const allTables = document.querySelectorAll('table');
            allTables.forEach((table, index) => {
                const tableText = table.textContent.toLowerCase();
                if (tableText.includes('dimension') || tableText.includes('specification') || 
                    tableText.includes('voltage') || tableText.includes('current') ||
                    tableText.includes('power') || tableText.includes('weight') ||
                    tableText.includes('size') || tableText.includes('length') ||
                    tableText.includes('width') || tableText.includes('height') ||
                    tableText.includes('depth') || tableText.includes('output') ||
                    tableText.includes('input') || tableText.includes('efficiency')) {
                    console.log(`Found potential specs table ${index}:`, table);
                    const rows = table.querySelectorAll('tr');
                    rows.forEach(row => {
                        const cells = row.querySelectorAll('td, th');
                        if (cells.length >= 2) {
                            const label = cells[0].textContent.trim();
                            const value = cells[1].textContent.trim();
                            if (label && value && label.length < 100) {
                                specs += label + ': ' + value + '\n';
                            }
                        }
                    });
                }
            });
        }
        
        // Additional search in all visible text areas for specifications
        if (!specs) {
            console.log('Searching all page content for specifications...');
            const allElements = document.querySelectorAll('div, p, span, td, th');
            allElements.forEach(element => {
                const text = element.textContent.trim();
                if (text.length > 10 && text.length < 500 && 
                    (text.toLowerCase().includes('dimension') || 
                     text.toLowerCase().includes('size') ||
                     text.toLowerCase().includes('specification') ||
                     text.match(/\d+.*?x.*?\d+.*?x.*?\d+/i) || // Pattern like "200 x 100 x 50"
                     text.match(/\d+\.?\d*\s*(mm|cm|inch|in)\s*x\s*\d+\.?\d*\s*(mm|cm|inch|in)/i))) {
                    specs += text + '\n';
                    console.log('Found spec content:', text.substring(0, 100));
                }
            });
        }
        
        // Fallback to any visible product information
        if (!specs) {
            const productInfo = document.querySelector('.product-info-main');
            if (productInfo) {
                specs = productInfo.textContent.trim().substring(0, 2000); // Limit length
                console.log('Using fallback product info');
            }
        }
        
        console.log('Final extracted specs length:', specs.length);
        console.log('Specs preview:', specs.substring(0, 500));
        
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
                top: 60%;
                transform: translateY(-50%);
                z-index: 9999;
                font-family: Arial, sans-serif;
            ">
                <!-- Chat Window -->
                <div id="${WIDGET_ID}-chat" style="
                    position: absolute;
                    top: -200px;
                    right: 110px;
                    width: 350px;
                    height: 400px;
                    background: rgba(102, 126, 234, 0.15);
                    backdrop-filter: blur(25px);
                    -webkit-backdrop-filter: blur(25px);
                    border: 1px solid rgba(255, 255, 255, 0.15);
                    border-radius: 20px;
                    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15), 
                                0 8px 32px rgba(102, 126, 234, 0.1);
                    display: none;
                    flex-direction: column;
                    transform: translateY(20px);
                    opacity: 0;
                    transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
                ">
                    <!-- Header -->
                    <div style="
                        background: linear-gradient(-45deg, #667eea, #764ba2, #667eea, #764ba2);
                        background-size: 400% 400%;
                        animation: gradient 6s ease infinite;
                        color: white;
                        padding: 20px;
                        border-radius: 20px 20px 0 0;
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        position: relative;
                        overflow: hidden;
                    ">
                        <style>
                            @keyframes gradient {
                                0% { background-position: 0% 50%; }
                                50% { background-position: 100% 50%; }
                                100% { background-position: 0% 50%; }
                            }
                        </style>
                        <div style="display: flex; align-items: center; z-index: 1;">
                            <img src="${WIDGET_API_BASE}/ask-ed-logo.png" style="
                                width: 60px;
                                height: 60px;
                                margin-right: 16px;
                                filter: drop-shadow(0 2px 4px rgba(0,0,0,0.1));
                                object-fit: contain;
                                border-radius: 50%;
                                background: rgba(255,255,255,0.1);
                            ">
                            <div>
                                <div style="
                                    font-weight: 600; 
                                    font-size: 18px;
                                    letter-spacing: -0.5px;
                                    margin-bottom: 2px;
                                ">Ask ED <span style="font-size: 12px; font-weight: 400; opacity: 0.8;">(beta)</span></div>
                                <div style="
                                    font-size: 13px; 
                                    opacity: 0.85;
                                    font-weight: 400;
                                ">Product Assistant</div>
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
                        background: transparent;
                        min-height: 200px;
                        scrollbar-width: thin;
                        scrollbar-color: rgba(255, 255, 255, 0.3) transparent;
                    ">
                        <style>
                            @keyframes slideIn {
                                from { 
                                    opacity: 0; 
                                    transform: translateY(15px); 
                                }
                                to { 
                                    opacity: 1; 
                                    transform: translateY(0); 
                                }
                            }
                        </style>
                        <div id="${WIDGET_ID}-welcome-msg" style="
                            background: rgba(102, 126, 234, 0.25);
                            backdrop-filter: blur(20px);
                            -webkit-backdrop-filter: blur(20px);
                            border: 2px solid rgba(255, 255, 255, 0.6);
                            padding: 20px;
                            border-radius: 16px;
                            margin-bottom: 16px;
                            font-size: 15px;
                            line-height: 1.5;
                            font-weight: 500;
                            box-shadow: 0 8px 32px rgba(102, 126, 234, 0.2), 
                                        0 4px 16px rgba(0, 0, 0, 0.05);
                            color: white;
                            text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
                        ">
                            <span id="${WIDGET_ID}-dynamic-message">👋 Hi! I'm Ask ED, ask me questions about this product and I'll do my best to answer them. Always check the datasheet for the latest information.</span>
                        </div>
                    </div>
                    
                    <!-- Input -->
                    <div style="
                        padding: 20px;
                        border-top: 1px solid rgba(255, 255, 255, 0.15);
                        background: transparent;
                        border-radius: 0 0 20px 20px;
                    ">
                        <div style="display: flex; gap: 12px; align-items: flex-end;">
                            <input id="${WIDGET_ID}-chat-input" type="text" placeholder="Continue the conversation..." style="
                                flex: 1;
                                padding: 12px 16px;
                                border: 1px solid rgba(255, 255, 255, 0.2);
                                border-radius: 12px;
                                font-size: 14px;
                                outline: none;
                                background: rgba(102, 126, 234, 0.15);
                                backdrop-filter: blur(15px);
                                color: white;
                                transition: all 0.3s ease;
                                font-family: inherit;
                            ">
                            <button id="${WIDGET_ID}-chat-send" style="
                                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
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
                    background: rgba(102, 126, 234, 0.2);
                    backdrop-filter: blur(20px);
                    -webkit-backdrop-filter: blur(20px);
                    border: 1px solid rgba(255, 255, 255, 0.2);
                    border-radius: 25px;
                    box-shadow: 0 8px 32px rgba(102, 126, 234, 0.2),
                                0 4px 16px rgba(0, 0, 0, 0.05);
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
                        color: white;
                        min-width: 0;
                    ">
                    <button id="${WIDGET_ID}-send" style="
                        background: #667eea;
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
                    width: 280px;
                    background: rgba(102, 126, 234, 0.2);
                    backdrop-filter: blur(20px);
                    -webkit-backdrop-filter: blur(20px);
                    border: 1px solid rgba(255, 255, 255, 0.2);
                    border-radius: 16px;
                    box-shadow: 0 8px 32px rgba(102, 126, 234, 0.2), 
                                0 4px 16px rgba(0, 0, 0, 0.05);
                    padding: 16px;
                    font-size: 14px;
                    line-height: 1.4;
                    opacity: 0;
                    transform: translateX(20px);
                    transition: all 0.4s ease;
                    pointer-events: none;
                ">
                    <div style="
                        margin-bottom: 8px;
                    ">
                        <strong style="color: white; font-size: 15px; text-shadow: 0 1px 2px rgba(0,0,0,0.3);">Ask ED</strong>
                    </div>
                    <div id="${WIDGET_ID}-welcome-text" style="color: white; text-shadow: 0 1px 2px rgba(0,0,0,0.2);">Ask me questions about this product!</div>
                    <!-- Speech bubble arrow -->
                    <div style="
                        position: absolute;
                        top: 50%;
                        right: -8px;
                        transform: translateY(-50%);
                        width: 0;
                        height: 0;
                        border-left: 8px solid rgba(102, 126, 234, 0.2);
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
                        border-left: 9px solid rgba(255, 255, 255, 0.18);
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
                    filter: drop-shadow(0 4px 12px rgba(0,0,0,0.15)) drop-shadow(0 0 25px rgba(102, 126, 234, 0.5));
                " id="${WIDGET_ID}-glow">
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
        const dynamicMessage = document.getElementById(`${WIDGET_ID}-dynamic-message`);
        
        let isSearchOpen = false;
        let isChatOpen = false;
        let welcomeShown = false;
        let hasConversationStarted = false;
        
        // Update welcome text with product name
        const productName = productInfo.title ? 
            productInfo.title.split(' ').slice(0, 3).join(' ') : 'this product';
        welcomeText.textContent = `Ask me questions about the ${productName}!`;
        
        // Update dynamic message with product name and datasheet link
        const shortProductName = productInfo.title ? 
            productInfo.title.split(' ').slice(0, 2).join(' ') : 'this product';
        
        let messageContent = `👋 Hi! I'm Ask ED, ask me questions about the ${shortProductName} and I'll do my best to answer them. Always check the `;
        
        if (productInfo.datasheetUrl) {
            messageContent += `<a href="${productInfo.datasheetUrl}" target="_blank" style="color: white; text-decoration: underline;">datasheet</a>`;
        } else {
            messageContent += 'datasheet';
        }
        messageContent += ' for the latest information.';
        
        dynamicMessage.innerHTML = messageContent;
        
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
        
        // Add hover effects for logo button
        toggle.addEventListener('mouseenter', () => {
            toggle.style.transform = 'scale(1.05)';
            toggle.style.filter = 'drop-shadow(0 4px 12px rgba(0,0,0,0.2)) drop-shadow(0 0 35px rgba(102, 126, 234, 0.7))';
        });
        
        toggle.addEventListener('mouseleave', () => {
            if (!isSearchOpen) {
                toggle.style.transform = 'scale(1)';
                toggle.style.filter = 'drop-shadow(0 4px 12px rgba(0,0,0,0.15)) drop-shadow(0 0 25px rgba(102, 126, 234, 0.5))';
            }
        });

        // Click logo → toggle search bar or chat window
        toggle.onclick = (e) => {
            e.stopPropagation();
            
            // If conversation has started, toggle chat window instead
            if (hasConversationStarted) {
                if (!isChatOpen) {
                    // Open chat window
                    chat.style.display = 'flex';
                    setTimeout(() => {
                        chat.style.transform = 'translateY(0)';
                        chat.style.opacity = '1';
                    }, 10);
                    isChatOpen = true;
                } else {
                    // Close chat window
                    chat.style.transform = 'translateY(10px)';
                    chat.style.opacity = '0';
                    setTimeout(() => {
                        chat.style.display = 'none';
                    }, 300);
                    isChatOpen = false;
                }
            } else {
                // Original behavior - toggle search bar
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
                    toggle.style.transform = 'scale(1.08)';
                    toggle.style.filter = 'drop-shadow(0 4px 12px rgba(0,0,0,0.25)) drop-shadow(0 0 45px rgba(102, 126, 234, 0.8))';
                } else {
                    // Close search bar
                    searchbar.style.width = '0';
                    searchbar.style.opacity = '0';
                    searchbar.style.border = 'none';
                    send.style.opacity = '0';
                    isSearchOpen = false;
                    toggle.style.transform = 'scale(1)';
                    toggle.style.filter = 'drop-shadow(0 4px 12px rgba(0,0,0,0.15)) drop-shadow(0 0 25px rgba(102, 126, 234, 0.5))';
                }
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
        input.onfocus = () => {
            input.placeholder = '';
        };
        
        input.onblur = () => {
            if (!input.value) {
                input.placeholder = 'Ask about this product...';
            }
        };
        
        input.onkeypress = (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        };
        
        send.onclick = sendMessage;
        
        // Chat window input handlers
        chatInput.onfocus = () => {
            chatInput.placeholder = '';
        };
        
        chatInput.onblur = () => {
            if (!chatInput.value) {
                chatInput.placeholder = 'Continue the conversation...';
            }
        };
          
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
                    `background: linear-gradient(135deg, rgba(102, 126, 234, 0.9) 0%, rgba(118, 75, 162, 0.9) 100%); 
                     backdrop-filter: blur(15px);
                     -webkit-backdrop-filter: blur(15px);
                     color: white; 
                     margin-left: auto; 
                     margin-right: 0;
                     border-radius: 18px 18px 4px 18px;
                     box-shadow: 0 8px 32px rgba(102, 126, 234, 0.3),
                                 0 4px 16px rgba(0, 0, 0, 0.1),
                                 inset 0 1px 0 rgba(255, 255, 255, 0.15);
                     border: 1px solid rgba(255, 255, 255, 0.3);
                     text-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);` : 
                    `background: rgba(102, 126, 234, 0.25); 
                     backdrop-filter: blur(20px);
                     -webkit-backdrop-filter: blur(20px);
                     color: white;
                     margin-left: 0;
                     margin-right: auto;
                     border-radius: 18px 18px 18px 4px;
                     border: 2px solid rgba(255, 255, 255, 0.6);
                     box-shadow: 0 8px 32px rgba(102, 126, 234, 0.2), 
                                 0 4px 16px rgba(0, 0, 0, 0.05);
                     text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);`
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
            
            // Mark that conversation has started
            hasConversationStarted = true;
            
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
            
            // Mark that conversation has started (in case this is first message)
            hasConversationStarted = true;
            
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