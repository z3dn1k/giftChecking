import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.6.0/firebase-app.js';
import {
    getFirestore,
    collection,
    onSnapshot,
    addDoc,
    setDoc,
    updateDoc,
    deleteDoc,
    doc,
    query,
    orderBy,
    serverTimestamp,
    getDocs
} from 'https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js';
import { 
    getAuth, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    signOut, 
    onAuthStateChanged 
} from 'https://www.gstatic.com/firebasejs/9.6.0/firebase-auth.js';

// --- CONFIGURATION ---
const firebaseConfig = {
    projectId: "giftchecking-7a553",
    apiKey: "AIzaSyB0WayJ_h8e7k2mSkW3ABt99E9PV6BtRrA", // ⚠️ PASTE YOUR REAL API KEY HERE ⚠️
    authDomain: "giftchecking-7a553.firebaseapp.com"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// --- STATE ---
let gifts = [];
let currentUser = null;
let currentViewingUid = null; // The User ID of the list we are currently looking at
let unsubscribeFromFirestore = null;
let currentFilter = 'all';

// --- DOM ELEMENTS ---
const userSelector = document.getElementById('userSelector');
const userSelectorContainer = document.getElementById('userSelectorContainer');
const listStatusMessage = document.getElementById('listStatusMessage');
const statsSection = document.getElementById('statsSection');
const addGiftSection = document.getElementById('addGiftSection');
const filterSection = document.getElementById('filterSection');
const giftsList = document.getElementById('giftsList');
const emptyState = document.getElementById('emptyState');

// --- AUTH HANDLERS ---
const modal = document.getElementById('authModal');
const authForm = document.getElementById('authForm');
const authEmail = document.getElementById('authEmail');
const authPassword = document.getElementById('authPassword');
const authError = document.getElementById('authError');
let isRegistering = false;

document.getElementById('openLoginBtn').addEventListener('click', () => openModal('Login'));
document.getElementById('openRegisterBtn').addEventListener('click', () => openModal('Register'));
document.getElementById('logoutBtn').addEventListener('click', () => signOut(auth));
document.querySelector('.close-modal').addEventListener('click', () => modal.style.display = 'none');

function openModal(type) {
    modal.style.display = 'block';
    document.getElementById('modalTitle').textContent = type;
    isRegistering = (type === 'Register');
    authError.textContent = '';
    authForm.reset();
}

authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = authEmail.value;
    const password = authPassword.value;
    try {
        let userCred;
        if (isRegistering) {
            userCred = await createUserWithEmailAndPassword(auth, email, password);
            // 🚨 SAVE USER TO PUBLIC LIST SO OTHERS CAN FIND THEM
            await setDoc(doc(db, "public_profiles", userCred.user.uid), {
                email: email,
                uid: userCred.user.uid
            });
        } else {
            userCred = await signInWithEmailAndPassword(auth, email, password);
        }
        modal.style.display = 'none';
    } catch (error) {
        authError.textContent = error.message;
    }
});

// --- MAIN LOGIC ---

onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    if (user) {
        // Logged In UI
        document.getElementById('loggedOutLinks').style.display = 'none';
        document.getElementById('loggedInLinks').style.display = 'flex';
        document.getElementById('userEmailDisplay').textContent = user.email;
        document.getElementById('appContent').style.display = 'block';
        document.getElementById('loginMessage').style.display = 'none';
        userSelectorContainer.style.display = 'block';

        // 1. Populate the Family Dropdown
        await loadFamilyMembers();

        // 2. Default to showing MY list
        userSelector.value = user.uid; 
        switchList(user.uid);

    } else {
        // Logged Out UI
        document.getElementById('loggedOutLinks').style.display = 'flex';
        document.getElementById('loggedInLinks').style.display = 'none';
        document.getElementById('appContent').style.display = 'none';
        document.getElementById('loginMessage').style.display = 'block';
        userSelectorContainer.style.display = 'none';
        if (unsubscribeFromFirestore) unsubscribeFromFirestore();
    }
});

async function loadFamilyMembers() {
    const querySnapshot = await getDocs(collection(db, "public_profiles"));
    userSelector.innerHTML = '';
    
    // Add "Me" option first
    // Note: In a real app, you might want to sort these
    querySnapshot.forEach((doc) => {
        const data = doc.data();
        const option = document.createElement('option');
        option.value = data.uid;
        option.textContent = (data.uid === currentUser.uid) ? `${data.email} (Já - Moje Přání)` : `🎄 ${data.email}`;
        userSelector.appendChild(option);
    });

    userSelector.onchange = (e) => {
        switchList(e.target.value);
    };
}

// Switch between viewing different users
function switchList(targetUid) {
    currentViewingUid = targetUid;
    const isMyList = (currentUser.uid === targetUid);

    // --- UI LOGIC FOR SURPRISE ---
    if (isMyList) {
        // I am looking at MY OWN list
        listStatusMessage.textContent = "🤫 Toto je tvoje přání. Nevidíš, co je koupeno (překvapení)!";
        listStatusMessage.style.color = "var(--text-muted)";
        addGiftSection.style.display = 'block';  // Can add items
        statsSection.style.display = 'none';     // Hide money/count stats
        filterSection.style.display = 'none';    // Hide filters
    } else {
        // I am looking at SOMEONE ELSE'S list (Santa Mode)
        listStatusMessage.textContent = "🎅 Jsi Ježíšek! Vidíš, co už je koupeno. Můžeš dárky odškrtávat.";
        listStatusMessage.style.color = "var(--neon-pink)";
        addGiftSection.style.display = 'none';   // Can't add items to their list
        statsSection.style.display = 'grid';     // Show stats
        filterSection.style.display = 'flex';    // Show filters
    }

    // Load Data
    if (unsubscribeFromFirestore) unsubscribeFromFirestore();
    const q = query(collection(db, "users", targetUid, "gifts"), orderBy("createdAt", "desc"));

    unsubscribeFromFirestore = onSnapshot(q, (snapshot) => {
        gifts = [];
        snapshot.forEach(doc => gifts.push({ id: doc.id, ...doc.data() }));
        renderGifts(isMyList);
        if (!isMyList) updateStats(); // Only update stats if we can see them
    });
}

function renderGifts(isOwner) {
    // Filter logic: Only apply filters if NOT owner (Owner sees all, just unchecked)
    const filtered = gifts.filter(gift => {
        if (isOwner) return true; 
        if (currentFilter === 'checked') return gift.checked;
        if (currentFilter === 'unchecked') return !gift.checked;
        return true;
    });

    if (filtered.length === 0) {
        giftsList.innerHTML = '';
        emptyState.style.display = 'block';
        return;
    }
    emptyState.style.display = 'none';

    giftsList.innerHTML = filtered.map(gift => {
        // SURPRISE LOGIC:
        // If Owner: Visually Unchecked (always), Disabled cursor.
        // If Guest: Real status, Pointer cursor.
        const isChecked = isOwner ? false : gift.checked; 
        const cursorStyle = isOwner ? 'cursor: not-allowed;' : 'cursor: pointer;';
        const checkboxDisabled = isOwner ? 'disabled' : '';
        
        // CSS Classes
        // 'owner-view' makes the checkbox semi-transparent and grey
        const itemClass = `gift-item ${isOwner ? 'owner-view' : (isChecked ? 'checked' : '')}`;

        return `
            <li class="${itemClass}">
                <div class="gift-checkbox">
                    <input 
                        type="checkbox" 
                        ${isChecked ? 'checked' : ''} 
                        ${checkboxDisabled}
                        onchange="toggleGift('${gift.id}')"
                        style="${cursorStyle}"
                    />
                </div>
                <div class="gift-info">
                    <div class="gift-name">${escapeHtml(gift.name)}</div>
                    <div class="gift-details">
                        <span class="recipient">${escapeHtml(gift.recipient)}</span>
                    </div>
                </div>
                <div class="gift-price">${gift.price} Kč</div>
                ${gift.link ? `<a href="${gift.link}" target="_blank" class="link-btn">🔗</a>` : ''}
                
                ${isOwner ? `<button class="delete-btn" onclick="deleteGift('${gift.id}')">✕</button>` : ''}
            </li>
        `;
    }).join('');
}

// Stats (Only for Guests)
function updateStats() {
    const purchased = gifts.filter(g => g.checked).length;
    const total = gifts.reduce((sum, g) => sum + (g.price || 0), 0);
    document.getElementById('totalGifts').textContent = gifts.length;
    document.getElementById('purchasedCount').textContent = purchased;
    document.getElementById('totalCost').textContent = total + " Kč";
}

// --- GLOBAL ACTIONS ---

window.toggleGift = async (id) => {
    // Security check: Owner cannot toggle their own gifts
    if (currentUser.uid === currentViewingUid) return;

    const gift = gifts.find(g => g.id === id);
    if (gift) {
        const ref = doc(db, "users", currentViewingUid, "gifts", id);
        await updateDoc(ref, { checked: !gift.checked });
    }
};

window.deleteGift = async (id) => {
    // Security check: Only owner can delete their own gifts
    if (currentUser.uid !== currentViewingUid) return;

    if (confirm("Opravdu smazat tento dárek?")) {
        await deleteDoc(doc(db, "users", currentUser.uid, "gifts", id));
    }
};

document.getElementById('addBtn').addEventListener('click', async () => {
    // Only works if viewing my own list
    if (currentUser.uid !== currentViewingUid) return;

    const name = document.getElementById('giftName').value.trim();
    if (!name) return;

    await addDoc(collection(db, "users", currentUser.uid, "gifts"), {
        name,
        recipient: document.getElementById('recipient').value,
        price: parseFloat(document.getElementById('price').value) || 0,
        link: document.getElementById('link').value,
        category: document.getElementById('category').value,
        checked: false,
        createdAt: serverTimestamp()
    });

    // Reset inputs
    document.getElementById('giftName').value = '';
    document.getElementById('recipient').value = '';
    document.getElementById('price').value = '';
    document.getElementById('link').value = '';
});

// Filter Listeners
document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentFilter = btn.dataset.filter;
        renderGifts(currentUser.uid === currentViewingUid);
    });
});

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
}