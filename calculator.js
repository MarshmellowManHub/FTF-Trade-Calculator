// calculator.js
let allItems = [];
let yourItems = [];
let theirItems = [];
let activeSide = 'your';
let modeHV = false;
// New state for modal filtering
let currentModalFilter = 'all';
const HV_DIVISOR = 40;

// Elements
const yourGrid = document.getElementById('your-grid');
const theirGrid = document.getElementById('their-grid');
const yourTotalEl = document.getElementById('your-total');
const theirTotalEl = document.getElementById('their-total');
const resultValEl = document.getElementById('result-value');
const resultLblEl = document.getElementById('result-label');
const barEl = document.getElementById('wfl-bar');
const modalSearch = document.getElementById('modal-search');

export async function initCalculator() {
    try {
        // Using the file data directly from app.js if loaded there, otherwise fetch.
        // Assuming app.js loads it first and makes it available or we fetch again.
        // For simplicity here, fetching again to ensure standalone functionality.
        const res = await fetch('ftf_items.json');
        const data = await res.json();
        allItems = data.items;
        updateUI();
        setupListeners();
    } catch(e) { console.error(e); }
}

function renderGrid(container, items, side) {
    container.innerHTML = '';
    for(let i=0; i<9; i++) {
        const item = items[i];
        const slot = document.createElement('div');
        slot.className = 'slot';

        if(item) {
            slot.innerHTML = `
                <div class="slot-content">
                    <img src="items/${item.name}.png" class="slot-img" onerror="this.src='items/Default.png'">
                    <div class="slot-controls" onclick="event.stopPropagation()">
                        <button class="ctrl-btn" onclick="modQty('${side}', ${i}, -1)">-</button>
                        <span class="ctrl-qty">${item.quantity}</span>
                        <button class="ctrl-btn" onclick="modQty('${side}', ${i}, 1)">+</button>
                    </div>
                </div>
            `;
            slot.onclick = () => { items.splice(i, 1); updateUI(); };
        } else {
            slot.onclick = () => window.openModal(side);
        }
        container.appendChild(slot);
    }
}

function updateUI() {
    renderGrid(yourGrid, yourItems, 'your');
    renderGrid(theirGrid, theirItems, 'their');

    const yVal = calcTotal(yourItems);
    const tVal = calcTotal(theirItems);
    const suffix = modeHV ? " hv" : " fv";

    yourTotalEl.textContent = fmt(yVal) + suffix;
    theirTotalEl.textContent = fmt(tVal) + suffix;

    const diff = tVal - yVal;

    if (yVal === 0 && tVal === 0) {
        resultValEl.textContent = "--";
        resultValEl.style.color = "#888";
        resultLblEl.textContent = "";
        barEl.style.width = "50%";
        barEl.style.background = "#444";
        return;
    }

    const winColor = "#22c55e";
    const loseColor = "#ef4444";
    const fairColor = "#ffffff";

    resultValEl.textContent = fmt(Math.abs(diff));
    
    if (diff > 0) {
        resultValEl.style.color = winColor;
        resultLblEl.textContent = suffix.trim() + " Win";
        resultLblEl.style.color = winColor;
        barEl.style.background = winColor;
    } else if (diff < 0) {
        resultValEl.style.color = loseColor;
        resultLblEl.textContent = suffix.trim() + " Loss";
        resultLblEl.style.color = loseColor;
        barEl.style.background = loseColor;
    } else {
        resultValEl.style.color = fairColor;
        resultLblEl.textContent = "Fair";
        resultLblEl.style.color = fairColor;
        barEl.style.background = fairColor;
    }

    const total = yVal + tVal;
    const percent = (tVal / total) * 100;
    barEl.style.width = `${percent}%`;
}

window.modQty = (side, index, change) => {
    const arr = side === 'your' ? yourItems : theirItems;
    arr[index].quantity += change;
    if(arr[index].quantity <= 0) arr.splice(index, 1);
    updateUI();
};

function calcTotal(arr) {
    return arr.reduce((acc, i) => acc + (i.value * i.quantity), 0);
}

function fmt(n) {
    if(modeHV) return (n / HV_DIVISOR).toFixed(2);
    return n.toLocaleString();
}

function setupListeners() {
    document.getElementById('reset-btn').onclick = () => {
        yourItems = []; theirItems = []; updateUI();
    };

    document.getElementById('mode-switch').onclick = (e) => {
        if(e.target.dataset.mode) {
            modeHV = e.target.dataset.mode === 'hv';
            document.querySelectorAll('.mode-opt').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            updateUI();
        }
    };

    // Search listener updates the list based on current search text
    modalSearch.addEventListener('input', () => renderModalList());

    // --- NEW: Sidebar Filter Listener ---
    window.filterModal = (rarity) => {
        currentModalFilter = rarity;
        // Update active button visual style
        document.querySelectorAll('.modal-filter-btn').forEach(btn => btn.classList.remove('active'));
        const btnMap = {'all':0,'Legendary':1,'Epic':2,'Rare':3,'Common':4};
        const sidebar = document.querySelector('.modal-sidebar');
        if(sidebar && sidebar.children[btnMap[rarity]]) sidebar.children[btnMap[rarity]].classList.add('active');
        
        // Re-render list with new filter
        renderModalList();
    };
}

window.openModal = (side) => {
    activeSide = side;
    modalSearch.value = "";
    // Reset filter to 'all' when opening modal
    filterModal('all'); 
    document.getElementById('modal').style.display = 'flex';
    modalSearch.focus();
};

window.closeModal = () => document.getElementById('modal').style.display = 'none';

// Updated to handle both search and rarity filtering
function renderModalList() {
    const list = document.getElementById('modal-list');
    list.innerHTML = '';
    const searchText = modalSearch.value.toLowerCase();
    
    const filtered = allItems.filter(item => {
        // Filter by Search Text AND Rarity
        const matchSearch = item.name.toLowerCase().includes(searchText);
        const matchRarity = currentModalFilter === 'all' || item.rarity === currentModalFilter;
        return matchSearch && matchRarity;
    });

    filtered.forEach(item => {
        const div = document.createElement('div');
        div.className = 'modal-item';
        // Added Demand Badge to HTML
        div.innerHTML = `
            <div class="modal-demand-badge">D: ${item.demand}</div>
            <img src="items/${item.name}.png" onerror="this.src='items/Default.png'">
            <div class="modal-item-name">${item.name}</div>
        `;
        div.onclick = () => {
            if (activeSide !== 'your' && activeSide !== 'their') return;

            const arr = activeSide === 'your' ? yourItems : theirItems;
            if(arr.length < 9) {
                const exists = arr.find(i => i.name === item.name);
                if(exists) exists.quantity++; else arr.push({ ...item, quantity: 1 });
                updateUI();
                window.closeModal();
            }
        };
        list.appendChild(div);
    });
}
