import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.6.0/firebase-app.js';
import {
    getFirestore,
    collection,
    onSnapshot,
    addDoc,
    updateDoc,
    deleteDoc,
    doc,
    query,
    orderBy,
    serverTimestamp
} from 'https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js';
import { 
    getAuth, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    signOut, 
    onAuthStateChanged 
} from 'https://www.gstatic.com/firebasejs/9.6.0/firebase-auth.js';

// --- Configuration ---
const firebaseConfig = {
    projectId: "giftchecking-7a553", // Ensure this matches your project
    apiKey: "AIzaSyB0WayJ_h8e7k2mSkW3ABt99E9PV6BtRrA",
    authDomain: "giftchecking-7a553.firebaseapp.com"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// --- State ---
let gifts = [];
let currentUser = null; // Stores the logged-in user
let unsubscribeFromFirestore = null; // To stop listening when logged out
let currentFilter = 'all';

// --- DOM Elements ---
const modal = document.getElementById('authModal');
const authForm = document.getElementById('authForm');
const modalTitle = document.getElementById('modalTitle');
const authEmail = document.getElementById('authEmail');
const authPassword = document.getElementById('authPassword');
const authError = document.getElementById('authError');
const closeModal = document.querySelector('.close-modal');

// --- Auth Event Listeners ---
document.getElementById('openLoginBtn').addEventListener('click', () => openModal('Login'));
document.getElementById('openRegisterBtn').addEventListener('click', () => openModal('Register'));
document.getElementById('logoutBtn').addEventListener('click', handleLogout);
closeModal.addEventListener('click', () => modal.style.display = 'none');
window.onclick = (event) => { if (event.target == modal) modal.style.display = 'none'; };

// --- Auth Logic ---
let isRegistering = false;

function openModal(type) {
    modal.style.display = 'block';
    modalTitle.textContent = type;
    isRegistering = (type === 'Register');
    authError.textContent = '';
    authForm.reset();
}

authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = authEmail.value;
    const password = authPassword.value;

    try {
        if (isRegistering) {
            await createUserWithEmailAndPassword(auth, email, password);
        } else {
            await signInWithEmailAndPassword(auth, email, password);
        }
        modal.style.display = 'none'; // Close modal on success
    } catch (error) {
        authError.textContent = error.message;
    }
});

function handleLogout() {
    signOut(auth);
}

// --- Main App Logic (Triggered by Auth State) ---
onAuthStateChanged(auth, (user) => {
    currentUser = user;
    
    if (user) {
        // User is Logged In
        console.log("User logged in:", user.email);
        document.getElementById('loggedOutLinks').style.display = 'none';
        document.getElementById('loggedInLinks').style.display = 'flex';
        document.getElementById('userEmailDisplay').textContent = user.email;
        document.getElementById('appContent').style.display = 'block';
        document.getElementById('loginMessage').style.display = 'none';

        // 🟢 Start Listening to THIS USER'S data
        setupFirestoreListener(user.uid);
    } else {
        // User is Logged Out
        console.log("User logged out");
        document.getElementById('loggedOutLinks').style.display = 'flex';
        document.getElementById('loggedInLinks').style.display = 'none';
        document.getElementById('appContent').style.display = 'none';
        document.getElementById('loginMessage').style.display = 'block';

        // 🔴 Stop Listening
        if (unsubscribeFromFirestore) {
            unsubscribeFromFirestore();
        }
        gifts = [];
        renderGifts();
    }
});

// --- Firestore Functions (Updated for Privacy) ---

function setupFirestoreListener(userId) {
    // 🔒 Path is now: users -> {userId} -> gifts
    const userGiftsRef = collection(db, "users", userId, "gifts");
    const q = query(userGiftsRef, orderBy("createdAt", "desc"));

    unsubscribeFromFirestore = onSnapshot(q, (querySnapshot) => {
        gifts = [];
        querySnapshot.forEach((doc) => {
            gifts.push({ id: doc.id, ...doc.data() });
        });
        renderGifts();
        updateStats();
    });
}

async function addGift() {
    if (!currentUser) return alert("Please login first");

    const giftNameInput = document.getElementById('giftName');
    const recipientInput = document.getElementById('recipient');
    const priceInput = document.getElementById('price');
    const linkInput = document.getElementById('link');
    const categorySelect = document.getElementById('category');

    const name = giftNameInput.value.trim();
    if (!name) return;

    const newGift = {
        name,
        recipient: recipientInput.value.trim(),
        price: parseFloat(priceInput.value) || 0,
        link: linkInput.value.trim(),
        checked: false,
        category: categorySelect.value,
        createdAt: serverTimestamp()
    };

    // 🔒 Save to user specific path
    await addDoc(collection(db, "users", currentUser.uid, "gifts"), newGift);
    
    // Clear inputs
    giftNameInput.value = '';
    recipientInput.value = '';
    priceInput.value = '';
    linkInput.value = '';
}

window.toggleGift = async (id) => {
    if (!currentUser) return;
    const gift = gifts.find(g => g.id === id);
    if (gift) {
        const giftRef = doc(db, "users", currentUser.uid, "gifts", id);
        await updateDoc(giftRef, { checked: !gift.checked });
    }
};

window.deleteGift = async (id) => {
    if (!currentUser) return;
    if (confirm("Delete this gift?")) {
        const giftRef = doc(db, "users", currentUser.uid, "gifts", id);
        await deleteDoc(giftRef);
    }
};

// --- Standard UI Functions (Same as before) ---
function renderGifts() {
    const giftsList = document.getElementById('giftsList');
    const emptyState = document.getElementById('emptyState');
    
    const filtered = gifts.filter(gift => {
        if (currentFilter === 'checked') return gift.checked;
        if (currentFilter === 'unchecked') return !gift.checked;
        return true;
    });

    if (filtered.length === 0) {
        if(giftsList) giftsList.innerHTML = '';
        if(emptyState) emptyState.style.display = 'block';
    } else {
        if(emptyState) emptyState.style.display = 'none';
        giftsList.innerHTML = filtered.map(gift => `
            <li class="gift-item ${gift.checked ? 'checked' : ''}">
                <div class="gift-checkbox">
                    <input type="checkbox" ${gift.checked ? 'checked' : ''} onchange="toggleGift('${gift.id}')"/>
                </div>
                <div class="gift-info">
                    <div class="gift-name">${escapeHtml(gift.name)}</div>
                    <div class="gift-details">
                        <span class="recipient">👤 ${escapeHtml(gift.recipient)}</span>
                        <span class="category-badge">${escapeHtml(gift.category)}</span>
                    </div>
                </div>
                <div class="gift-price">${gift.price.toFixed(2)} Kč</div>
                ${gift.link ? `<a href="${gift.link}" target="_blank" class="link-btn">🔗</a>` : ''}
                <button class="delete-btn" onclick="deleteGift('${gift.id}')">✕</button>
            </li>
        `).join('');
    }
}

function updateStats() {
    const purchasedCount = gifts.filter(g => g.checked).length;
    const totalCost = gifts.reduce((sum, gift) => sum + (gift.price || 0), 0);
    
    document.getElementById('totalGifts').textContent = gifts.length;
    document.getElementById('purchasedCount').textContent = purchasedCount;
    document.getElementById('totalCost').textContent = `${totalCost.toFixed(2)} Kč`;
    
    // Update filter counts
    document.querySelector('[data-filter="all"] .filter-count').textContent = gifts.length;
    document.querySelector('[data-filter="unchecked"] .filter-count').textContent = gifts.filter(g => !g.checked).length;
    document.querySelector('[data-filter="checked"] .filter-count').textContent = purchasedCount;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
}

// Initial Listener setup
document.getElementById('addBtn').addEventListener('click', addGift);

// Filter setup
document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentFilter = btn.dataset.filter;
        renderGifts();
    });
});