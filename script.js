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
    getDocs,
    getDoc
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
let currentViewingUid = null; 
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
const authUsername = document.getElementById('authUsername'); // New Input
const authError = document.getElementById('authError');
let isRegistering = false;

document.getElementById('openLoginBtn').addEventListener('click', () => openModal('Login'));
document.getElementById('openRegisterBtn').addEventListener('click', () => openModal('Register'));
document.getElementById('logoutBtn').addEventListener('click', () => signOut(auth));
document.querySelector('.close-modal').addEventListener('click', () => modal.style.display = 'none');

function openModal(type) {
    console.log("Opening modal for:", type); // Debug check

    modal.style.display = 'block';
    
    // Set title
    const titleElement = document.getElementById('modalTitle');
    if (titleElement) titleElement.textContent = (type === 'Register') ? 'Registrace' : 'Přihlášení';
    
    isRegistering = (type === 'Register');
    authError.textContent = '';
    authForm.reset();

    // Force the element retrieval right here to be safe
    const usernameInput = document.getElementById('authUsername');

    if (isRegistering) {
        console.log("Showing username input");
        usernameInput.style.display = 'block';
        usernameInput.required = true;
    } else {
        console.log("Hiding username input");
        usernameInput.style.display = 'none';
        usernameInput.required = false;
    }
}

authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = authEmail.value;
    const password = authPassword.value;
    const username = authUsername.value; // Get username

    try {
        let userCred;
        if (isRegistering) {
            // 1. Create Auth User
            userCred = await createUserWithEmailAndPassword(auth, email, password);
            
            // 2. Save Username to Public Profile
            await setDoc(doc(db, "public_profiles", userCred.user.uid), {
                email: email,
                username: username, // Save the name!
                uid: userCred.user.uid
            });
        } else {
            // Login
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
        
        // Try to fetch my own username for display in navbar
        const myProfileSnap = await getDoc(doc(db, "public_profiles", user.uid));
        if (myProfileSnap.exists()) {
            document.getElementById('userEmailDisplay').textContent = myProfileSnap.data().username;
        } else {
            document.getElementById('userEmailDisplay').textContent = user.email;
        }

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
    
    querySnapshot.forEach((doc) => {
        const data = doc.data();
        const option = document.createElement('option');
        option.value = data.uid;
        
        // Use Username if available, otherwise Email
        const displayName = data.username || data.email;
        
        option.textContent = (data.uid === currentUser.uid) ? `${displayName} (Já - Moje Přání)` : `🎄 ${displayName}`;
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
        addGiftSection.style.display = 'block';  
        statsSection.style.display = 'none';     
        filterSection.style.display = 'none';    
    } else {
        // I am looking at SOMEONE ELSE'S list
        // Get name of the person we are viewing
        const selectedOption = userSelector.options[userSelector.selectedIndex];
        const name = selectedOption ? selectedOption.text.replace('🎄 ', '') : 'nich';

        listStatusMessage.textContent = `🎅 Jsi Ježíšek pro: ${name}! Vidíš, co už je koupeno.`;
        listStatusMessage.style.color = "var(--neon-pink)";
        addGiftSection.style.display = 'none';   
        statsSection.style.display = 'grid';     
        filterSection.style.display = 'flex';    
    }

    // Load Data
    if (unsubscribeFromFirestore) unsubscribeFromFirestore();
    const q = query(collection(db, "users", targetUid, "gifts"), orderBy("createdAt", "desc"));

    unsubscribeFromFirestore = onSnapshot(q, (snapshot) => {
        gifts = [];
        snapshot.forEach(doc => gifts.push({ id: doc.id, ...doc.data() }));
        renderGifts(isMyList);
        if (!isMyList) updateStats(); 
    });
}

function renderGifts(isOwner) {
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
        const isChecked = isOwner ? false : gift.checked; 
        const cursorStyle = isOwner ? 'cursor: not-allowed;' : 'cursor: pointer;';
        const checkboxDisabled = isOwner ? 'disabled' : '';
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

function updateStats() {
    const purchased = gifts.filter(g => g.checked).length;
    const total = gifts.reduce((sum, g) => sum + (g.price || 0), 0);
    document.getElementById('totalGifts').textContent = gifts.length;
    document.getElementById('purchasedCount').textContent = purchased;
    document.getElementById('totalCost').textContent = total + " Kč";
}

// --- GLOBAL ACTIONS ---

window.toggleGift = async (id) => {
    if (currentUser.uid === currentViewingUid) return;
    const gift = gifts.find(g => g.id === id);
    if (gift) {
        const ref = doc(db, "users", currentViewingUid, "gifts", id);
        await updateDoc(ref, { checked: !gift.checked });
    }
};

window.deleteGift = async (id) => {
    if (currentUser.uid !== currentViewingUid) return;
    if (confirm("Opravdu smazat tento dárek?")) {
        await deleteDoc(doc(db, "users", currentUser.uid, "gifts", id));
    }
};

document.getElementById('addBtn').addEventListener('click', async () => {
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

    document.getElementById('giftName').value = '';
    document.getElementById('recipient').value = '';
    document.getElementById('price').value = '';
    document.getElementById('link').value = '';
});

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