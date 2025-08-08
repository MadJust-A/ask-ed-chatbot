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
                <!-- Search Bar (slides out from right) -->
                <div id="${WIDGET_ID}-searchbar" style="
                    position: absolute;
                    bottom: 60px;
                    right: 0;
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
                    ">→</button>
                </div>
                
                <!-- Response Bubble -->
                <div id="${WIDGET_ID}-response" style="
                    position: absolute;
                    bottom: 120px;
                    right: 0;
                    max-width: 350px;
                    background: white;
                    border: 1px solid #ddd;
                    border-radius: 16px;
                    box-shadow: 0 4px 20px rgba(0,0,0,0.15);
                    padding: 16px;
                    font-size: 14px;
                    line-height: 1.4;
                    display: none;
                    transform: translateY(10px);
                    transition: all 0.3s ease;
                ">
                    <div style="
                        display: flex;
                        align-items: center;
                        margin-bottom: 8px;
                    ">
                        <img src="${WIDGET_API_BASE}/ask-ed-logo.png" style="
                            width: 20px;
                            height: 20px;
                            margin-right: 8px;
                        ">
                        <strong style="color: #2c5aa0;">Ask Ed</strong>
                    </div>
                    <div id="${WIDGET_ID}-response-text"></div>
                    <button id="${WIDGET_ID}-close-response" style="
                        position: absolute;
                        top: 8px;
                        right: 8px;
                        background: none;
                        border: none;
                        font-size: 18px;
                        cursor: pointer;
                        color: #999;
                        width: 24px;
                        height: 24px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                    ">×</button>
                </div>
                
                <!-- Toggle Button with Logo -->
                <button id="${WIDGET_ID}-toggle" style="
                    width: 50px;
                    height: 50px;
                    border-radius: 50%;
                    background: white;
                    border: 2px solid #ddd;
                    cursor: pointer;
                    box-shadow: 0 2px 10px rgba(0,0,0,0.2);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 0;
                    transition: all 0.3s ease;
                ">
                    <img src="${WIDGET_API_BASE}/ask-ed-logo.png" style="
                        width: 38px;
                        height: 38px;
                        border-radius: 50%;
                    ">
                </button>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', widgetHTML);
        
        // Event listeners
        setupEventListeners(productInfo);
    }
    
    function setupEventListeners(productInfo) {
        const toggle = document.getElementById(`${WIDGET_ID}-toggle`);
        const searchbar = document.getElementById(`${WIDGET_ID}-searchbar`);
        const response = document.getElementById(`${WIDGET_ID}-response`);
        const closeResponse = document.getElementById(`${WIDGET_ID}-close-response`);
        const input = document.getElementById(`${WIDGET_ID}-input`);
        const send = document.getElementById(`${WIDGET_ID}-send`);
        const responseText = document.getElementById(`${WIDGET_ID}-response-text`);
        
        let isSearchOpen = false;
        
        toggle.onclick = () => {
            if (!isSearchOpen) {
                // Open search bar
                searchbar.style.width = '300px';
                send.style.opacity = '1';
                setTimeout(() => input.focus(), 300);
                isSearchOpen = true;
                
                // Add hover effect to toggle button
                toggle.style.transform = 'scale(1.1)';
            } else {
                // Close search bar
                searchbar.style.width = '0';
                send.style.opacity = '0';
                response.style.display = 'none';
                isSearchOpen = false;
                toggle.style.transform = 'scale(1)';
            }
        };
        
        // Close search when clicking outside
        document.addEventListener('click', (e) => {
            if (!document.getElementById(WIDGET_ID).contains(e.target) && isSearchOpen) {
                searchbar.style.width = '0';
                send.style.opacity = '0';
                response.style.display = 'none';
                isSearchOpen = false;
                toggle.style.transform = 'scale(1)';
            }
        });
        
        closeResponse.onclick = () => {
            response.style.display = 'none';
        };
        
        input.onkeypress = (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        };
        
        send.onclick = sendMessage;
        
        function showResponse(content) {
            responseText.innerHTML = content.replace(/\n/g, '<br>');
            response.style.display = 'block';
            response.style.transform = 'translateY(0)';
        }
        
        async function sendMessage() {
            const question = input.value.trim();
            if (!question) return;
            
            input.value = '';
            send.disabled = true;
            send.innerHTML = '⏳';
            
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
                    showResponse(`Sorry, ${data.error}`);
                } else {
                    showResponse(data.answer || 'No answer received');
                }
                
            } catch (error) {
                console.error('Ask Ed error:', error);
                showResponse('Sorry, I\'m experiencing technical difficulties. Please contact a Bravo Power Expert via web chat or call 408-733-9090.');
            } finally {
                send.disabled = false;
                send.innerHTML = '→';
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