// Get Firestore reference
const db = window.firebaseApp?.db;

// Gift data structure
let gifts = [];
let currentFilter = 'all';
let firebaseReady = !!db;

// Festive messages
const christmasMessages = [
    "🎄 Santa approves! 🎄",
    "✨ Ho ho ho! ✨",
    "🎁 Perfect gift choice! 🎁",
    "⛄ So festive! ⛄",
    "🔔 Jingle all the way! 🔔",
    "❄️ Winter wonderland! ❄️",
];

// DOM elements
const giftNameInput = document.getElementById('giftName');
const recipientInput = document.getElementById('recipient');
const priceInput = document.getElementById('price');
const linkInput = document.getElementById('link');
const categorySelect = document.getElementById('category');
const addBtn = document.getElementById('addBtn');
const giftsList = document.getElementById('giftsList');
const emptyState = document.getElementById('emptyState');
const filterBtns = document.querySelectorAll('.filter-btn');

// Check if Firebase is ready
if (!firebaseReady) {
    console.error('❌ Firebase is not initialized!');
} else {
    console.log('✅ Firebase is ready!');
}

// Set up real-time listener for Firestore
function setupRealtimeListener() {
    if (!db) {
        console.error('❌ Database not available');
        return;
    }

    db.collection('gifts')
        .orderBy('createdAt', 'desc')
        .onSnapshot((snapshot) => {
            gifts = [];
            snapshot.forEach((docSnapshot) => {
                gifts.push({
                    id: docSnapshot.id,
                    ...docSnapshot.data()
                });
            });
            console.log('📦 Gifts loaded:', gifts.length);
            renderGifts();
            updateStats();
        }, (error) => {
            console.error('❌ Error loading gifts:', error);
        });
}

// Add new gift
async function addGift() {
    if (!firebaseReady) {
        alert('🎅 Firebase is still loading, please refresh and try again!');
        return;
    }

    const name = giftNameInput.value.trim();
    const recipient = recipientInput.value.trim();
    const price = parseFloat(priceInput.value);
    const link = linkInput.value.trim();
    const category = categorySelect.value;

    if (!name || !recipient || !price || price <= 0) {
        alert('🎅 Please fill in all fields with valid values, dear gift giver!');
        return;
    }

    try {
        console.log('📝 Adding gift to Firestore...');
        // Add to Firestore
        await db.collection('gifts').add({
            name,
            recipient,
            price,
            link: link || null,
            checked: false,
            category,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        console.log('✅ Gift added successfully!');
        
        // Show festive message
        showFestiveMessage();

        // Clear inputs
        giftNameInput.value = '';
        recipientInput.value = '';
        priceInput.value = '';
        linkInput.value = '';
        categorySelect.value = 'general';
        giftNameInput.focus();
    } catch (error) {
        console.error('❌ Error adding gift:', error);
        alert('❌ Error adding gift: ' + error.message);
    }
}

// Show festive message
function showFestiveMessage() {
    const message = christmasMessages[Math.floor(Math.random() * christmasMessages.length)];
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: linear-gradient(135deg, #dc143c 0%, #0f7938 100%);
        color: #ffd700;
        padding: 1rem 1.5rem;
        border-radius: 8px;
        border: 2px solid #ffd700;
        font-weight: 600;
        box-shadow: 0 4px 15px rgba(255, 215, 0, 0.3);
        z-index: 1000;
        animation: slideIn 0.3s ease-out;
    `;
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => notification.remove(), 300);
    }, 2000);
}

// Add animation styles
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(400px);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(400px);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

// Render all gifts
function renderGifts() {
    const filtered = gifts.filter(gift => {
        if (currentFilter === 'checked') return gift.checked;
        if (currentFilter === 'unchecked') return !gift.checked;
        return true;
    });

    // Show/hide empty state
    if (gifts.length === 0) {
        emptyState.style.display = 'block';
        giftsList.innerHTML = '';
    } else {
        emptyState.style.display = 'none';
        giftsList.innerHTML = filtered.map(gift => `
            <li class="gift-item ${gift.checked ? 'checked' : ''}">
                <div class="gift-checkbox">
                    <input
                        type="checkbox"
                        ${gift.checked ? 'checked' : ''}
                        onchange="toggleGift(${gift.id})"
                    />
                </div>
                <div class="gift-info">
                    <div class="gift-name">${escapeHtml(gift.name)}</div>
                    <div class="gift-details">
                        <span class="recipient">👤 ${escapeHtml(gift.recipient)}</span>
                        <span class="category-badge">${escapeHtml(gift.category)}</span>
                    </div>
                </div>
                <div class="gift-price">${gift.price.toFixed(2)} Kč</div>
                ${gift.link ? `<a href="${escapeHtml(gift.link)}" target="_blank" rel="noopener noreferrer" class="link-btn" title="View product page">🔗</a>` : ''}
                <button class="delete-btn" onclick="deleteGift(${gift.id})" title="Remove from list">
                    ✕
                </button>
            </li>
        `).join('');
    }
}

// Toggle gift checked status
async function toggleGift(id) {
    if (!firebaseReady) return;
    
    try {
        const gift = gifts.find(g => g.id === id);
        if (gift) {
            await db.collection('gifts').doc(id).update({
                checked: !gift.checked
            });
        }
    } catch (error) {
        console.error('Error toggling gift:', error);
    }
}

// Delete gift
async function deleteGift(id) {
    if (!firebaseReady) return;
    
    try {
        await db.collection('gifts').doc(id).delete();
    } catch (error) {
        console.error('Error deleting gift:', error);
        alert('❌ Error deleting gift. Please try again!');
    }
}

// Update statistics
function updateStats() {
    const totalGifts = gifts.length;
    const purchasedCount = gifts.filter(g => g.checked).length;
    const totalCost = gifts.reduce((sum, gift) => sum + gift.price, 0);
    const progressPercentage = totalGifts > 0 ? (purchasedCount / totalGifts) * 100 : 0;

    // Update DOM
    document.getElementById('totalGifts').textContent = totalGifts;
    document.getElementById('purchasedCount').textContent = purchasedCount;
    document.getElementById('totalCost').textContent = `${totalCost.toFixed(2)} Kč`;
    document.getElementById('progressFill').style.width = `${progressPercentage}%`;
    document.getElementById('progressText').textContent = `${purchasedCount} of ${totalGifts}`;

    // Update filter counts
    document.querySelector('[data-filter="all"] .filter-count').textContent = totalGifts;
    document.querySelector('[data-filter="unchecked"] .filter-count').textContent = 
        gifts.filter(g => !g.checked).length;
    document.querySelector('[data-filter="checked"] .filter-count').textContent = purchasedCount;
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    if (!firebaseReady) {
        console.error('❌ Firebase not ready on DOMContentLoaded');
        alert('❌ Failed to initialize Firebase. Please refresh the page.');
        return;
    }
    
    console.log('✅ DOM loaded, setting up listeners...');
    
    // Set up real-time listener
    setupRealtimeListener();
    
    // Event listeners
    addBtn.addEventListener('click', addGift);
    giftNameInput.addEventListener('keypress', (e) => e.key === 'Enter' && addGift());
    recipientInput.addEventListener('keypress', (e) => e.key === 'Enter' && addGift());
    priceInput.addEventListener('keypress', (e) => e.key === 'Enter' && addGift());

    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.dataset.filter;
            renderGifts();
        });
    });
    
    giftNameInput.focus();
    console.log('✅ App fully initialized!');
});