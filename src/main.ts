import './index.css';
import { createIcons, Home, BarChart2, Settings, Zap, Utensils, Car, ShoppingCart, CircleDollarSign, Gamepad2, Coffee, Plane, Edit2, Trash2, ChevronDown, Search, HeartPulse, GraduationCap, Home as HomeIcon, Smartphone, Gift, Briefcase, X, Filter } from 'lucide';

// --- DATABASE (IndexedDB) ---
const DB_NAME = 'PocketPulseDB';
const DB_VERSION = 1;

function initDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onupgradeneeded = (event: any) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('transactions')) {
        const txStore = db.createObjectStore('transactions', { keyPath: 'id', autoIncrement: true });
        txStore.createIndex('timestamp', 'timestamp', { unique: false });
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
    };
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getSetting(key: string, defaultVal: any) {
  const db = await initDB();
  return new Promise((resolve) => {
    const tx = db.transaction('settings', 'readonly');
    const store = tx.objectStore('settings');
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result ? req.result.value : defaultVal);
    req.onerror = () => resolve(defaultVal);
  });
}

async function setSetting(key: string, value: any) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('settings', 'readwrite');
    const store = tx.objectStore('settings');
    const req = store.put({ key, value });
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

async function addTransaction(tx: any) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('transactions', 'readwrite');
    const store = transaction.objectStore('transactions');
    const request = store.add({ ...tx, timestamp: Date.now() });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function updateTransaction(tx: any) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('transactions', 'readwrite');
    const store = transaction.objectStore('transactions');
    const request = store.put(tx);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function deleteTransaction(id: number) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('transactions', 'readwrite');
    const store = transaction.objectStore('transactions');
    const request = store.delete(id);
    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error);
  });
}

async function getTransactions() {
  const db = await initDB();
  return new Promise<any[]>((resolve, reject) => {
    const transaction = db.transaction('transactions', 'readonly');
    const store = transaction.objectStore('transactions');
    const request = store.getAll();
    request.onsuccess = () => {
      const txs = request.result;
      txs.sort((a, b) => b.timestamp - a.timestamp);
      resolve(txs);
    };
    request.onerror = () => reject(request.error);
  });
}

// --- STATE ---
let weeklyBudget = 3000;
let acc = 0;
let tapHistory: number[] = [];
let globalCurrency = '₹';
let historySearchQuery = '';
let historySearchDate = '';
let historySearchCategory = '';
let appTheme: 'glass' | 'solid' = 'glass';
let remindersEnabled = false;
let reminderTime = '20';
let lastReminderDate = '';

// --- TAB SWITCHING ---
const TABS = ['home', 'reports', 'settings'];
let currentTabIndex = 0;

(window as any).switchTab = function(tabId: string, el?: HTMLElement) {
  if (navigator.vibrate) navigator.vibrate(10);
  currentTabIndex = TABS.indexOf(tabId);
  if (currentTabIndex === -1) currentTabIndex = 0;
  
  const wrapper = document.getElementById('tabs-wrapper');
  if (wrapper) {
    requestAnimationFrame(() => {
      wrapper.style.transition = 'transform 0.4s cubic-bezier(0.32, 0.72, 0, 1)';
      wrapper.style.transform = `translateX(-${currentTabIndex * 33.3333}%)`;
    });
  }
  
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  
  if (el) {
    el.classList.add('active');
  } else {
    const navItems = document.querySelectorAll('.nav-item');
    if (navItems[currentTabIndex]) {
      navItems[currentTabIndex].classList.add('active');
    }
  }
};

// --- SETTINGS LOGIC ---
(window as any).saveSetting = async function(key: string, val: string) {
  if (navigator.vibrate) navigator.vibrate(15);
  await setSetting(key, Number(val));
  updateState();
  (window as any).showToast('Saved!');
};

// --- NUMPAD LOGIC ---
function triggerPop(elId: string) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.classList.remove('pop-anim');
  void el.offsetWidth; // trigger reflow
  el.classList.add('pop-anim');
}

function updateAccDisplay() {
  const display = document.getElementById('np-display');
  if (!display) return;
  if (acc === 0) {
    display.innerText = 'Tap a number...';
    display.style.opacity = '0.5';
  } else {
    display.innerText = tapHistory.length > 1 
      ? `${tapHistory.join(' + ')} = ${globalCurrency}${acc}`
      : `${globalCurrency}${acc}`;
    display.style.opacity = '1';
  }
  triggerPop('np-display');
}

(window as any).addNum = function(val: number) {
  if (navigator.vibrate) navigator.vibrate(10);
  acc += val;
  tapHistory.push(val);
  updateAccDisplay();
};

(window as any).undoTap = function() {
  if (navigator.vibrate) navigator.vibrate(15);
  if (tapHistory.length === 0) return (window as any).showToast('Nothing to undo');
  const last = tapHistory.pop();
  if (last) acc -= last;
  updateAccDisplay();
};

(window as any).clearNum = function() {
  if (navigator.vibrate) navigator.vibrate(20);
  acc = 0; 
  tapHistory = [];
  updateAccDisplay();
};

(window as any).logTransaction = async function() {
  if (navigator.vibrate) navigator.vibrate([15, 50, 15]);
  if (acc === 0) return (window as any).showToast('Tap a number to log!');
  
  const tx = {
    amount: acc,
    type: 'spend',
    note: selectedHomeCategory.name,
    icon: selectedHomeCategory.id
  };
  
  await addTransaction(tx);
  (window as any).showToast(`Logged ${globalCurrency}${acc} successfully!`);
  (window as any).clearNum();
  updateState();
};

// --- UI UPDATES ---
function getStartOfWeek() {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const start = new Date(now.setDate(diff));
  start.setHours(0, 0, 0, 0);
  return start.getTime();
}

function sanitizeIcon(icon: string): string {
  if (!icon) return 'zap';
  
  const emojiMap: Record<string, string> = {
    '🍔': 'utensils',
    '🚗': 'car',
    '🛒': 'shopping-cart',
    '⚡': 'zap',
    '💰': 'circle-dollar-sign',
    '🎮': 'gamepad-2',
    '🏥': 'coffee',
    '🎓': 'plane',
    '📝': 'zap'
  };
  
  if (emojiMap[icon]) return emojiMap[icon];
  
  const validIcons = ['zap', 'utensils', 'car', 'shopping-cart', 'circle-dollar-sign', 'gamepad-2', 'coffee', 'plane'];
  if (validIcons.includes(icon)) return icon;
  
  return 'zap';
}

const DEFAULT_NUMPAD = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];

const CATEGORIES = [
  { id: 'zap', name: 'General' },
  { id: 'utensils', name: 'Food' },
  { id: 'car', name: 'Transport' },
  { id: 'shopping-cart', name: 'Shopping' },
  { id: 'circle-dollar-sign', name: 'Money' },
  { id: 'gamepad-2', name: 'Entertainment' },
  { id: 'coffee', name: 'Coffee' },
  { id: 'plane', name: 'Travel' },
  { id: 'heart-pulse', name: 'Health' },
  { id: 'graduation-cap', name: 'Education' },
  { id: 'home', name: 'Housing' },
  { id: 'smartphone', name: 'Bills' },
  { id: 'gift', name: 'Gifts' },
  { id: 'briefcase', name: 'Work' }
];
let selectedHomeCategory = CATEGORIES[0];
let globalReportPeriod: 'weekly' | 'monthly' | 'yearly' | 'custom' = 'weekly';

function getStartDate(period: string) {
  const now = new Date();
  if (period === 'weekly') {
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
    const start = new Date(now.setDate(diff));
    start.setHours(0, 0, 0, 0);
    return start.getTime();
  } else if (period === 'monthly') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    start.setHours(0, 0, 0, 0);
    return start.getTime();
  } else if (period === 'yearly') {
    const start = new Date(now.getFullYear(), 0, 1);
    start.setHours(0, 0, 0, 0);
    return start.getTime();
  } else {
    return 0; // All time
  }
}

function formatNumpadDisplay(val: number) {
  if (val >= 1000) {
    return (val / 1000) + 'K';
  }
  return val.toString();
}

async function renderNumpad() {
  const numpadValues = await getSetting('numpadValues', DEFAULT_NUMPAD) as number[];
  
  // Render Home Numpad
  const grid = document.getElementById('numpad-grid');
  if (grid) {
    grid.innerHTML = '';
    numpadValues.forEach(val => {
      const btn = document.createElement('button');
      btn.className = 'np-btn';
      btn.innerText = formatNumpadDisplay(val);
      btn.onclick = () => (window as any).addNum(val);
      grid.appendChild(btn);
    });
  }
  
  // Render Settings Numpad
  const settingsGrid = document.getElementById('numpad-settings-grid');
  if (settingsGrid) {
    settingsGrid.innerHTML = '';
    numpadValues.forEach((val, index) => {
      const input = document.createElement('input');
      input.type = 'number';
      input.className = 'numpad-setting-input';
      input.value = val.toString();
      input.min = '1';
      input.step = '1';
      input.onchange = (e: any) => {
        let newVal = parseInt(e.target.value, 10);
        if (isNaN(newVal) || newVal <= 0) newVal = 1;
        e.target.value = newVal.toString();
        (window as any).updateNumpadValue(index, newVal);
      };
      settingsGrid.appendChild(input);
    });
  }
}

function renderHomeCategories() {
  const slider = document.getElementById('home-cat-slider');
  if (!slider) return;
  slider.innerHTML = '';
  
  CATEGORIES.forEach(cat => {
    const btn = document.createElement('div');
    btn.className = `home-cat-btn ${cat.id === selectedHomeCategory.id ? 'selected' : ''}`;
    btn.onclick = () => (window as any).selectHomeCategory(cat.id);
    btn.innerHTML = `<i data-lucide="${cat.id}"></i>`;
    slider.appendChild(btn);
  });
  
  // Re-initialize icons for the newly rendered buttons
  createIcons({
    icons: { Home, BarChart2, Settings, Zap, Utensils, Car, ShoppingCart, CircleDollarSign, Gamepad2, Coffee, Plane, Edit2, Trash2, Search, HeartPulse, GraduationCap, HomeIcon, Smartphone, Gift, Briefcase, X, Filter }
  });
  
  // Update contrast for the new buttons based on current theme
  const hex = document.documentElement.style.getPropertyValue('--accent') || '#C8FF00';
  const isDark = ['#4DBBFF', '#B46DFF', '#FF6B4D'].includes(hex);
}

function renderEditCategories() {
  const slider = document.getElementById('edit-icon-slider');
  if (!slider) return;
  slider.innerHTML = '';
  
  CATEGORIES.forEach(cat => {
    const btn = document.createElement('div');
    btn.className = `icon-option ${cat.id === currentEditIcon ? 'selected' : ''}`;
    btn.onclick = () => (window as any).selectIcon(btn, cat.id);
    btn.innerHTML = `<i data-lucide="${cat.id}"></i>`;
    slider.appendChild(btn);
  });
  
  createIcons({
    icons: { Home, BarChart2, Settings, Zap, Utensils, Car, ShoppingCart, CircleDollarSign, Gamepad2, Coffee, Plane, Edit2, Trash2, Search, HeartPulse, GraduationCap, HomeIcon, Smartphone, Gift, Briefcase, X, Filter }
  });
}

(window as any).selectHomeCategory = function(id: string) {
  if (navigator.vibrate) navigator.vibrate(15);
  const cat = CATEGORIES.find(c => c.id === id);
  if (cat) {
    selectedHomeCategory = cat;
    renderHomeCategories();
  }
};

(window as any).updateNumpadValue = async function(index: number, val: number) {
  const numpadValues = await getSetting('numpadValues', DEFAULT_NUMPAD) as number[];
  numpadValues[index] = val;
  await setSetting('numpadValues', numpadValues);
  renderNumpad();
};

(window as any).toggleSearchFilters = function() {
  const container = document.getElementById('search-filters-container');
  if (container) {
    if (container.classList.contains('hidden')) {
      container.classList.remove('hidden');
      renderSearchCategories();
    } else {
      container.classList.add('hidden');
      (window as any).clearSearchFilters();
    }
  }
};

(window as any).filterHistoryText = function() {
  const input = document.getElementById('history-search-input') as HTMLInputElement;
  if (input) {
    historySearchQuery = input.value;
    updateState();
  }
};

function renderSearchCategories() {
  const slider = document.getElementById('search-cat-slider');
  if (!slider) return;
  slider.innerHTML = '';
  
  CATEGORIES.forEach(cat => {
    const btn = document.createElement('div');
    btn.className = `search-cat-btn ${cat.id === historySearchCategory ? 'selected' : ''}`;
    btn.onclick = () => {
      historySearchCategory = historySearchCategory === cat.id ? '' : cat.id;
      renderSearchCategories();
      updateState();
    };
    btn.innerHTML = `<i data-lucide="${cat.id}"></i>`;
    slider.appendChild(btn);
  });
  
  createIcons({
    icons: { Home, BarChart2, Settings, Zap, Utensils, Car, ShoppingCart, CircleDollarSign, Gamepad2, Coffee, Plane, Edit2, Trash2, Search, HeartPulse, GraduationCap, HomeIcon, Smartphone, Gift, Briefcase, X, Filter }
  });
}

(window as any).clearSearchFilters = function() {
  const dateInput = document.getElementById('history-search-date') as HTMLInputElement;
  if (dateInput) dateInput.value = '';
  historySearchDate = '';
  historySearchCategory = '';
  renderSearchCategories();
  updateState();
};

(window as any).filterHistory = function() {
  const dateInput = document.getElementById('history-search-date') as HTMLInputElement;
  if (dateInput) {
    historySearchDate = dateInput.value;
  }
  updateState();
};

async function updateState() {
  const txs = await getTransactions();
  const userLimits = await getSetting('userLimits', { weekly: 3000, monthly: 12000, yearly: 144000, custom: 0 }) as Record<string, number>;
  const userEarnings = await getSetting('userEarnings', { weekly: 8000, monthly: 32000, yearly: 384000, custom: 0 }) as Record<string, number>;
  
  const startOfPeriod = getStartDate(globalReportPeriod);
  
  let spentThisPeriod = 0;
  let earnedThisPeriod = 0;
  
  txs.forEach(tx => {
    if (tx.timestamp >= startOfPeriod) {
      if (tx.type === 'spend') spentThisPeriod += tx.amount;
      if (tx.type === 'earn') earnedThisPeriod += tx.amount;
    }
  });
  
  let scaledLimit = userLimits[globalReportPeriod] || 0;
  let expectedEarn = userEarnings[globalReportPeriod] || 0;
  
  scaledLimit = Math.round(scaledLimit);
  
  // Update Hero Card
  const heroTotal = document.getElementById('hero-total');
  if (heroTotal) heroTotal.innerHTML = `<span class="currency-symbol">${globalCurrency}</span>${spentThisPeriod.toLocaleString()}`;
  
  const heroBudgetText = document.getElementById('hero-budget-text');
  if (heroBudgetText) {
    if (globalReportPeriod === 'custom') {
      document.getElementById('hero-budget-container')!.style.display = 'none';
      document.getElementById('hero-budget-bar')!.style.display = 'none';
    } else {
      document.getElementById('hero-budget-container')!.style.display = 'block';
      document.getElementById('hero-budget-bar')!.style.display = 'block';
      heroBudgetText.innerHTML = `<span class="currency-symbol">${globalCurrency}</span>${scaledLimit.toLocaleString()}`;
    }
  }
  
  const pct = Math.min((spentThisPeriod / scaledLimit) * 100, 100);
  const heroProgress = document.getElementById('hero-progress');
  if (heroProgress) heroProgress.style.width = pct + '%';
  
  const periodTextMap: Record<string, string> = {
    'weekly': "THIS WEEK'S SPEND",
    'monthly': "THIS MONTH'S SPEND",
    'yearly': "THIS YEAR'S SPEND",
    'custom': "ALL TIME SPEND"
  };
  const heroPeriodText = document.getElementById('hero-period-text');
  if (heroPeriodText) heroPeriodText.innerText = periodTextMap[globalReportPeriod];
  
  // Update Reports Tab
  const reportSpent = document.getElementById('report-spent');
  if (reportSpent) reportSpent.innerHTML = `<span class="currency-symbol">${globalCurrency}</span>${spentThisPeriod.toLocaleString()}`;
  
  const reportEarned = document.getElementById('report-earned');
  if (reportEarned) reportEarned.innerHTML = `<span class="currency-symbol">${globalCurrency}</span>${earnedThisPeriod.toLocaleString()}`;
  
  const surplus = earnedThisPeriod - spentThisPeriod;
  const reportSurplus = document.getElementById('report-surplus');
  if (reportSurplus) {
    reportSurplus.innerHTML = `${surplus >= 0 ? '+' : '-'}<span class="currency-symbol">${globalCurrency}</span>${Math.abs(surplus).toLocaleString()}`;
    reportSurplus.style.color = surplus >= 0 ? 'var(--text)' : 'var(--accent)';
  }
  
  // Update Trend Chart
  const trendBox = document.getElementById('trend-box');
  if (trendBox) {
    trendBox.innerHTML = '';
    const now = Date.now();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayStartMs = todayStart.getTime();
    
    let effectiveStart = startOfPeriod;
    
    let bucketCount = 7;
    let getBucketIdx = (txTime: number) => 0;

    if (globalReportPeriod === 'weekly') {
      bucketCount = 7;
      getBucketIdx = (txTime: number) => {
        const d = new Date(txTime);
        let day = d.getDay() - 1; // 0 = Mon, 6 = Sun
        if (day === -1) day = 6;
        return day;
      };
    } else if (globalReportPeriod === 'monthly') {
      const dStart = new Date(effectiveStart);
      const daysInMonth = new Date(dStart.getFullYear(), dStart.getMonth() + 1, 0).getDate();
      bucketCount = daysInMonth;
      getBucketIdx = (txTime: number) => new Date(txTime).getDate() - 1;
    } else if (globalReportPeriod === 'yearly') {
      bucketCount = 12;
      getBucketIdx = (txTime: number) => new Date(txTime).getMonth();
    } else {
      // custom (all time)
      const firstTx = txs.length > 0 ? Math.min(...txs.map(t => t.timestamp)) : now - (30 * 24 * 60 * 60 * 1000);
      effectiveStart = firstTx;
      bucketCount = 12;
      const periodDuration = Math.max(now - effectiveStart, 1000);
      const bucketSize = periodDuration / bucketCount;
      getBucketIdx = (txTime: number) => {
        let idx = Math.floor((txTime - effectiveStart) / bucketSize);
        if (idx >= bucketCount) idx = bucketCount - 1;
        if (idx < 0) idx = 0;
        return idx;
      };
    }

    const buckets = new Array(bucketCount).fill(0);

    txs.forEach(tx => {
      if (tx.timestamp >= effectiveStart && tx.type === 'spend') {
        const idx = getBucketIdx(tx.timestamp);
        if (idx >= 0 && idx < bucketCount) {
          buckets[idx] += tx.amount;
        }
      }
    });

    const maxBucket = Math.max(...buckets, 1);

    buckets.forEach((val, idx) => {
      const heightPct = Math.max((val / maxBucket) * 100, 5); // min 5% height for visual presence
      const bar = document.createElement('div');
      
      let isActive = false;
      if (globalReportPeriod === 'weekly') {
        let today = new Date().getDay() - 1;
        if (today === -1) today = 6;
        isActive = idx === today;
      } else if (globalReportPeriod === 'monthly') {
        isActive = idx === new Date().getDate() - 1;
      } else if (globalReportPeriod === 'yearly') {
        isActive = idx === new Date().getMonth();
      } else {
        isActive = idx === bucketCount - 1;
      }
      
      bar.className = `trend-bar ${isActive ? 'active' : ''}`;
      bar.style.height = `${heightPct}%`;
      trendBox.appendChild(bar);
    });
  }
  
  // Update Inputs (only if not focused to avoid overriding user typing)
  const periodStr = globalReportPeriod === 'custom' ? 'ALL TIME' : globalReportPeriod.toUpperCase();
  
  const reportLimitLabel = document.getElementById('report-limit-label');
  if (reportLimitLabel) reportLimitLabel.innerText = `${periodStr} MAX LIMIT`;

  const reportEarningsLabel = document.getElementById('report-earnings-label');
  if (reportEarningsLabel) reportEarningsLabel.innerText = `${periodStr} EXPECTED EARNINGS`;

  const limitWeeklyInput = document.getElementById('limit-weekly') as HTMLInputElement;
  if (limitWeeklyInput && document.activeElement !== limitWeeklyInput) {
    limitWeeklyInput.value = scaledLimit.toString();
  }
  const limitEarningsInput = document.getElementById('limit-earnings') as HTMLInputElement;
  if (limitEarningsInput && document.activeElement !== limitEarningsInput) {
    limitEarningsInput.value = expectedEarn.toString();
  }
  
  // Update History List
  const historyContainer = document.getElementById('history-container');
  if (historyContainer) {
    historyContainer.innerHTML = '';
    let recentTxs = txs;
    
    if (historySearchDate) {
      const searchDate = new Date(historySearchDate);
      recentTxs = recentTxs.filter(tx => {
        const txDate = new Date(tx.timestamp);
        return txDate.getFullYear() === searchDate.getFullYear() &&
               txDate.getMonth() === searchDate.getMonth() &&
               txDate.getDate() === searchDate.getDate();
      });
    }
    
    if (historySearchCategory) {
      recentTxs = recentTxs.filter(tx => tx.icon === historySearchCategory);
    }
    
    recentTxs = recentTxs.slice(0, 50); // Show last 50 transactions
    recentTxs.forEach((tx, index) => {
      const date = new Date(tx.timestamp);
      const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const today = new Date();
      const isToday = date.getDate() === today.getDate() && date.getMonth() === today.getMonth() && date.getFullYear() === today.getFullYear();
      const dateStr = isToday ? 'Today' : date.toLocaleDateString([], { month: 'short', day: 'numeric' });
      const dateTimeStr = `${dateStr}, ${timeStr}`;
      
      const isSpend = tx.type === 'spend';
      const amtClass = isSpend ? 'spend' : (tx.type === 'earn' ? 'earn' : 'lend');
      const sign = isSpend ? '-' : '+';
      const iconBg = '#2A2A2A'; // Lighter dark-gray for contrast
      const iconColor = '#FFFFFF'; // High contrast white
      const safeIcon = sanitizeIcon(tx.icon);
      
      const delay = Math.min(index * 0.03, 0.3); // Stagger up to 0.3s
      
      const entryHtml = `
        <div class="swipe-container" style="animation-delay: ${delay}s">
          <div class="swipe-scroll">
            <div class="swipe-front" onclick="openEdit(${tx.id}, '${tx.note.replace(/'/g, "\\'")}', ${tx.amount}, '${tx.type}', '${safeIcon}', ${tx.timestamp})">
              <div class="entry-left">
                <div class="entry-icon" style="background:${iconBg}; color:${iconColor}"><i data-lucide="${safeIcon}"></i></div>
                <div>
                  <div class="entry-note">${tx.note}</div>
                  <div class="entry-time">${dateTimeStr}</div>
                </div>
              </div>
              <div class="entry-amt ${amtClass}">${sign}<span class="currency-symbol">${globalCurrency}</span>${tx.amount.toLocaleString()}</div>
            </div>
            <div class="swipe-actions">
              <button class="swipe-btn edit" onclick="openEdit(${tx.id}, '${tx.note.replace(/'/g, "\\'")}', ${tx.amount}, '${tx.type}', '${safeIcon}', ${tx.timestamp})"><i data-lucide="edit-2"></i></button>
              <button class="swipe-btn delete" onclick="deleteTx(${tx.id}, event)"><i data-lucide="trash-2"></i></button>
            </div>
          </div>
        </div>
      `;
      historyContainer.insertAdjacentHTML('beforeend', entryHtml);
    });
  }
  
  // Re-initialize Lucide icons for dynamically added elements
  createIcons({
    icons: { Home, BarChart2, Settings, Zap, Utensils, Car, ShoppingCart, CircleDollarSign, Gamepad2, Coffee, Plane, Edit2, Trash2, ChevronDown, Search, HeartPulse, GraduationCap, HomeIcon, Smartphone, Gift, Briefcase, X, Filter }
  });
}

(window as any).openPeriodSelector = function() {
  if (navigator.vibrate) navigator.vibrate(15);
  const overlay = document.getElementById('period-overlay');
  if (overlay) overlay.classList.add('open');
  
  document.querySelectorAll('.period-option').forEach(opt => {
    opt.classList.remove('selected');
    if (opt.getAttribute('data-period') === globalReportPeriod) {
      opt.classList.add('selected');
    }
  });
};

(window as any).closePeriodSelector = function(e: any) {
  if (!e || e.target.id === 'period-overlay') {
    const overlay = document.getElementById('period-overlay');
    if (overlay) overlay.classList.remove('open');
  }
};

(window as any).setGlobalPeriod = function(period: 'weekly' | 'monthly' | 'yearly' | 'custom') {
  if (navigator.vibrate) navigator.vibrate(15);
  globalReportPeriod = period;
  (window as any).closePeriodSelector();
  updateState();
};

// --- SETTINGS LOGIC ---
(window as any).setAppTheme = async function(theme: 'glass' | 'solid') {
  if (navigator.vibrate) navigator.vibrate(15);
  appTheme = theme;
  await setSetting('appTheme', theme);
  document.body.className = `theme-${appTheme}`;
  
  // Update toggle UI
  const glassBtn = document.getElementById('theme-btn-glass');
  const solidBtn = document.getElementById('theme-btn-solid');
  if (glassBtn && solidBtn) {
    if (theme === 'glass') {
      glassBtn.classList.add('active');
      solidBtn.classList.remove('active');
    } else {
      solidBtn.classList.add('active');
      glassBtn.classList.remove('active');
    }
  }
};

(window as any).openCurrencySelector = function() {
  if (navigator.vibrate) navigator.vibrate(15);
  const overlay = document.getElementById('currency-overlay');
  if (overlay) overlay.classList.add('open');
  
  document.querySelectorAll('.currency-option').forEach(opt => {
    opt.classList.remove('selected');
    if (opt.getAttribute('data-currency') === globalCurrency) {
      opt.classList.add('selected');
    }
  });
};

(window as any).closeCurrencySelector = function(e: any) {
  if (!e || e.target.id === 'currency-overlay') {
    const overlay = document.getElementById('currency-overlay');
    if (overlay) overlay.classList.remove('open');
  }
};

(window as any).setCurrency = async function(val: string, label: string) {
  if (navigator.vibrate) navigator.vibrate(15);
  globalCurrency = val;
  await setSetting('currency', val);
  
  // Update all static instances in DOM
  document.querySelectorAll('.currency-symbol').forEach(el => {
    el.innerHTML = globalCurrency;
  });
  
  const display = document.getElementById('currency-display');
  if (display) {
    display.querySelector('span')!.innerText = label;
  }
  
  (window as any).closeCurrencySelector();
  updateState();
  updateAccDisplay();
  (window as any).updateEditDisplay();
  (window as any).showToast('Currency updated');
};

(window as any).openReminderSelector = function() {
  if (navigator.vibrate) navigator.vibrate(15);
  const overlay = document.getElementById('reminder-overlay');
  if (overlay) overlay.classList.add('open');
  
  document.querySelectorAll('.reminder-option').forEach(opt => {
    opt.classList.remove('selected');
    if (opt.getAttribute('data-time') === reminderTime) {
      opt.classList.add('selected');
    }
  });
};

(window as any).closeReminderSelector = function(e: any) {
  if (!e || e.target.id === 'reminder-overlay') {
    const overlay = document.getElementById('reminder-overlay');
    if (overlay) overlay.classList.remove('open');
  }
};

function initRemindersUI() {
  const toggle = document.getElementById('reminder-toggle');
  const timeRow = document.getElementById('reminder-time-row');
  const display = document.getElementById('reminder-display');
  
  if (toggle) {
    toggle.innerText = remindersEnabled ? 'Enabled ✓' : 'Enable';
    toggle.style.color = remindersEnabled ? 'var(--accent)' : 'var(--text)';
  }
  if (timeRow) {
    timeRow.style.display = remindersEnabled ? 'flex' : 'none';
  }
  if (display) {
    display.querySelector('span')!.innerText = reminderTime === '14' ? 'Afternoon (2:00 PM)' : 'Evening (8:00 PM)';
  }
}

(window as any).toggleReminders = async function() {
  if (!remindersEnabled) {
    if (!("Notification" in window)) {
      (window as any).showToast('Notifications not supported');
      return;
    }
    const perm = await Notification.requestPermission();
    if (perm === 'granted') {
      remindersEnabled = true;
    } else {
      (window as any).showToast('Permission denied');
      return;
    }
  } else {
    remindersEnabled = false;
  }
  await setSetting('remindersEnabled', remindersEnabled);
  initRemindersUI();
};

(window as any).saveReminderTime = async function(val: string, label: string) {
  if (navigator.vibrate) navigator.vibrate(15);
  reminderTime = val;
  await setSetting('reminderTime', val);
  
  const display = document.getElementById('reminder-display');
  if (display) {
    display.querySelector('span')!.innerText = label;
  }
  
  (window as any).closeReminderSelector();
  (window as any).showToast('Reminder time saved');
};

function startReminderCron() {
  setInterval(async () => {
    if (!remindersEnabled) return;
    const now = new Date();
    const todayStr = now.toDateString();
    if (lastReminderDate === todayStr) return; // Already reminded today
    
    if (now.getHours() === parseInt(reminderTime, 10)) {
      new Notification("PocketPulse", {
        body: "Spent anything recently? Log it quickly!",
        icon: "/icon.png"
      });
      lastReminderDate = todayStr;
      await setSetting('lastReminderDate', todayStr);
    }
  }, 60000); // Check every minute
}

(window as any).saveLimit = async function(val: string) {
  const limits = await getSetting('userLimits', { weekly: 3000, monthly: 12000, yearly: 144000, custom: 0 }) as Record<string, number>;
  limits[globalReportPeriod] = parseFloat(val) || 0;
  await setSetting('userLimits', limits);
  updateState();
};

(window as any).saveEarnings = async function(val: string) {
  const earnings = await getSetting('userEarnings', { weekly: 8000, monthly: 32000, yearly: 384000, custom: 0 }) as Record<string, number>;
  earnings[globalReportPeriod] = parseFloat(val) || 0;
  await setSetting('userEarnings', earnings);
  updateState();
};

// --- DATA EXPORT ---
(window as any).exportData = async function(format: 'csv' | 'txt') {
  const txs = await getTransactions();
  if (txs.length === 0) {
    (window as any).showToast('No data to export');
    return;
  }
  
  let content = '';
  let filename = `PocketPulse_Export_${new Date().toISOString().split('T')[0]}`;
  
  if (format === 'csv') {
    content = 'ID,Date,Time,Type,Category,Amount,Note\n';
    txs.forEach(tx => {
      const d = new Date(tx.timestamp);
      const dateStr = d.toLocaleDateString();
      const timeStr = d.toLocaleTimeString();
      content += `${tx.id},${dateStr},${timeStr},${tx.type},${tx.icon},${tx.amount},"${tx.note.replace(/"/g, '""')}"\n`;
    });
    filename += '.csv';
  } else {
    content = 'PocketPulse Transaction Log\n===========================\n\n';
    txs.forEach(tx => {
      const d = new Date(tx.timestamp);
      content += `[${d.toLocaleString()}] ${tx.type.toUpperCase()} - ${tx.icon}\n`;
      content += `Amount: ${globalCurrency}${tx.amount}\n`;
      content += `Note: ${tx.note}\n`;
      content += `---------------------------\n`;
    });
    filename += '.txt';
  }
  
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  
  (window as any).showToast(`Exported as ${format.toUpperCase()}`);
};

// --- TOAST ---
let toastTimer: any;
(window as any).showToast = function(msg: string) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2000);
};

// --- THEME & SETTINGS ---
(window as any).setTheme = async function(el: HTMLElement | null, hex: string, save = true) {
  if (navigator.vibrate && save) navigator.vibrate(15);
  document.querySelectorAll('.dot').forEach(d => d.classList.remove('selected'));
  if (el) {
    el.classList.add('selected');
  } else {
    const dot = document.querySelector(`.dot[data-color="${hex}"]`);
    if (dot) dot.classList.add('selected');
  }
  
  document.documentElement.style.setProperty('--accent', hex);
  
  const metaTheme = document.getElementById('theme-color-meta');
  if (metaTheme) {
    metaTheme.setAttribute('content', hex);
  }
  
  // Manage Numpad contrast
  const numpad = document.getElementById('numpad-wrapper');
  const isDark = ['#4DBBFF', '#B46DFF', '#FF6B4D'].includes(hex);
  const textColor = isDark ? '#ffffff' : '#000000';
  
  document.documentElement.style.setProperty('--accent-text', textColor);
  document.documentElement.style.setProperty('--accent-btn-bg', isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.05)');
  document.documentElement.style.setProperty('--accent-btn-border', isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.12)');
  document.documentElement.style.setProperty('--accent-btn-active', isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.15)');
  document.documentElement.style.setProperty('--accent-log-bg', isDark ? '#ffffff' : '#000000');
  document.documentElement.style.setProperty('--accent-log-text', isDark ? '#000000' : hex);
  document.documentElement.style.setProperty('--accent-glow', isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.2)');
  
  const saveBtn = document.querySelector('.save-btn') as HTMLElement;
  if (saveBtn) saveBtn.style.color = textColor;
  
  document.querySelectorAll('.swipe-btn.edit').forEach((btn: any) => {
    btn.style.color = textColor;
  });
  
  if (save) {
    await setSetting('accentColor', hex);
    (window as any).showToast('Theme updated!');
  }
};

(window as any).confirmWipe = function() {
  const overlay = document.getElementById('wipe-confirm-overlay');
  if (overlay) overlay.classList.add('open');
};

(window as any).cancelWipe = function(e: any) {
  if (!e || e.target.id === 'wipe-confirm-overlay' || e.target.classList.contains('cancel-btn')) {
    const overlay = document.getElementById('wipe-confirm-overlay');
    if (overlay) overlay.classList.remove('open');
  }
};

(window as any).executeWipe = async function() {
  const db = await initDB();
  const tx = db.transaction(['transactions', 'settings'], 'readwrite');
  tx.objectStore('transactions').clear();
  tx.objectStore('settings').clear();
  tx.oncomplete = () => {
    (window as any).showToast('All data wiped!');
    setTimeout(() => window.location.reload(), 1000);
  };
};

let currentEditId: number | null = null;
let currentEditIcon = 'zap';
let currentEditType = 'spend';
let currentEditTimestamp = 0;

(window as any).openEdit = function(id: number, note: string, amt: number, type: string, icon: string, timestamp: number) {
  if (navigator.vibrate) navigator.vibrate(15);
  currentEditId = id;
  currentEditIcon = icon;
  currentEditTimestamp = timestamp;
  
  const noteInput = document.getElementById('edit-note-input') as HTMLInputElement;
  const amtInput = document.getElementById('edit-amt-input') as HTMLInputElement;
  if (noteInput) noteInput.value = note;
  if (amtInput) amtInput.value = amt.toString();
  
  (window as any).setType(null, type);
  
  renderEditCategories();
  
  const overlay = document.getElementById('edit-overlay');
  if (overlay) overlay.classList.add('open');
};

(window as any).selectIcon = function(el: HTMLElement, icon: string) {
  if (navigator.vibrate) navigator.vibrate(15);
  document.querySelectorAll('.icon-option').forEach(opt => opt.classList.remove('selected'));
  el.classList.add('selected');
  currentEditIcon = icon;
};

(window as any).closeEdit = function(e: any) {
  if (e.target.id === 'edit-overlay') {
    document.getElementById('edit-overlay')?.classList.remove('open');
    const sheet = document.getElementById('edit-sheet');
    if (sheet) sheet.style.transform = '';
  }
};

(window as any).setType = function(el: HTMLElement | null, type: string) {
  if (navigator.vibrate) navigator.vibrate(15);
  document.querySelectorAll('.type-btn').forEach(t => t.classList.remove('active'));
  currentEditType = type;
  
  if (el) {
    el.classList.add('active');
  } else {
    const btn = document.querySelector(`.type-btn.${type}`);
    if (btn) btn.classList.add('active');
  }
  (window as any).updateEditDisplay();
};

(window as any).updateEditDisplay = function() {
  const amtInput = document.getElementById('edit-amt-input') as HTMLInputElement;
  const amt = amtInput ? (amtInput.value || '0') : '0';
  const display = document.getElementById('edit-display');
  if (!display) return;
  
  const isSpend = currentEditType === 'spend';
  display.innerText = (isSpend ? '-' : '+') + globalCurrency + amt;
  display.style.color = isSpend ? 'var(--accent)' : 'var(--text)';
};

(window as any).saveEdit = async function() {
  if (navigator.vibrate) navigator.vibrate([15, 30, 15]);
  if (currentEditId === null) return;
  
  const noteInput = document.getElementById('edit-note-input') as HTMLInputElement;
  const amtInput = document.getElementById('edit-amt-input') as HTMLInputElement;
  
  const updatedTx = {
    id: currentEditId,
    note: noteInput.value || 'Transaction',
    amount: Number(amtInput.value) || 0,
    type: currentEditType,
    icon: currentEditIcon,
    timestamp: currentEditTimestamp
  };
  
  await updateTransaction(updatedTx);
  
  const overlay = document.getElementById('edit-overlay');
  if (overlay) overlay.classList.remove('open');
  
  const sheet = document.getElementById('edit-sheet');
  if (sheet) sheet.style.transform = '';
  
  (window as any).showToast('Changes saved! ✓');
  updateState();
};

// --- DRAG TO SAVE LOGIC ---
document.addEventListener('DOMContentLoaded', () => {
  const sheet = document.getElementById('edit-sheet');
  if (!sheet) return;
  
  let startY = 0;
  let currentY = 0;
  let isDragging = false;

  sheet.addEventListener('touchstart', (e) => {
    if (sheet.scrollTop > 0) return; // Only drag if at the top
    startY = e.touches[0].clientY;
    isDragging = true;
    sheet.style.transition = 'none';
  }, { passive: true });

  let isSheetTicking = false;
  sheet.addEventListener('touchmove', (e) => {
    if (!isDragging) return;
    currentY = e.touches[0].clientY;
    const deltaY = currentY - startY;
    
    if (deltaY > 0) {
      if (e.cancelable) e.preventDefault();
      if (!isSheetTicking) {
        isSheetTicking = true;
        requestAnimationFrame(() => {
          sheet.style.transform = `translateY(${deltaY}px)`;
          isSheetTicking = false;
        });
      }
    }
  }, { passive: false });

  sheet.addEventListener('touchend', () => {
    if (!isDragging) return;
    isDragging = false;
    sheet.style.transition = 'transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1)';
    
    const deltaY = currentY - startY;
    if (deltaY > 100) {
      (window as any).saveEdit();
    } else {
      sheet.style.transform = '';
    }
    currentY = 0;
    startY = 0;
  });
});

(window as any).deleteTx = async function(id: number, event: Event) {
  event.stopPropagation();
  if (navigator.vibrate) navigator.vibrate([15, 30, 15]);
  await deleteTransaction(id);
  (window as any).showToast('Transaction deleted');
  updateState();
};

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  const savedColor = await getSetting('accentColor', '#C8FF00') as string;
  (window as any).setTheme(null, savedColor, false);
  
  globalCurrency = await getSetting('currency', '₹') as string;
  appTheme = await getSetting('appTheme', 'glass') as 'glass' | 'solid';
  document.body.className = `theme-${appTheme}`;
  
  // Initialize theme toggle UI
  const glassBtn = document.getElementById('theme-btn-glass');
  const solidBtn = document.getElementById('theme-btn-solid');
  if (glassBtn && solidBtn) {
    if (appTheme === 'glass') {
      glassBtn.classList.add('active');
      solidBtn.classList.remove('active');
    } else {
      solidBtn.classList.add('active');
      glassBtn.classList.remove('active');
    }
  }
  
  remindersEnabled = await getSetting('remindersEnabled', false) as boolean;
  reminderTime = await getSetting('reminderTime', '20') as string;
  lastReminderDate = await getSetting('lastReminderDate', '') as string;
  
  const currSelect = document.getElementById('currency-select') as HTMLSelectElement;
  if (currSelect) currSelect.value = globalCurrency;
  
  initRemindersUI();
  startReminderCron();
  
  updateState();
  renderNumpad();
  renderHomeCategories();
  
  // Initialize Lucide icons on first load
  createIcons({
    icons: { Home, BarChart2, Settings, Zap, Utensils, Car, ShoppingCart, CircleDollarSign, Gamepad2, Coffee, Plane, Edit2, Trash2, ChevronDown, Search, HeartPulse, GraduationCap, HomeIcon, Smartphone, Gift, Briefcase, X, Filter }
  });

  // --- SWIPE NAVIGATION LOGIC ---
  const appContainer = document.querySelector('.app-container');
  const tabsWrapper = document.getElementById('tabs-wrapper');
  if (appContainer && tabsWrapper) {
    let startX = 0;
    let startY = 0;
    let isSwiping = false;
    let currentTranslate = 0;

    appContainer.addEventListener('touchstart', (e: any) => {
      if (e.target.closest('.home-cat-slider') || 
          e.target.closest('.icon-slider') || 
          e.target.closest('.swipe-scroll') || 
          e.target.closest('.trend-box') ||
          e.target.closest('#numpad-wrapper') ||
          e.target.closest('.setting-row') ||
          e.target.closest('input') ||
          e.target.closest('button')) {
        return;
      }
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      isSwiping = true;
      currentTranslate = currentTabIndex * -33.3333;
      tabsWrapper.style.transition = 'none';
    }, { passive: true });

    let isTicking = false;
    appContainer.addEventListener('touchmove', (e: any) => {
      if (!isSwiping || isTicking) return;
      
      const currentX = e.touches[0].clientX;
      const currentY = e.touches[0].clientY;
      
      isTicking = true;
      requestAnimationFrame(() => {
        const diffX = currentX - startX;
        const diffY = currentY - startY;
        
        // If scrolling vertically more than horizontally, or moving vertically by more than 15px, cancel swipe
        if (Math.abs(diffY) > Math.abs(diffX) || Math.abs(diffY) > 15) {
          isSwiping = false;
          tabsWrapper.style.transition = 'transform 0.4s cubic-bezier(0.32, 0.72, 0, 1)';
          tabsWrapper.style.transform = `translateX(-${currentTabIndex * 33.3333}%)`;
        } else if (isSwiping) {
          const percentMove = (diffX / window.innerWidth) * 33.3333;
          let newTranslate = currentTranslate + percentMove;
          // Add resistance at edges
          if (newTranslate > 0) newTranslate = newTranslate / 3;
          if (newTranslate < -66.6666) newTranslate = -66.6666 + ((newTranslate + 66.6666) / 3);
          
          tabsWrapper.style.transform = `translateX(${newTranslate}%)`;
        }
        isTicking = false;
      });
    }, { passive: true });

    appContainer.addEventListener('touchend', (e: any) => {
      if (!isSwiping) return;
      const diffX = e.changedTouches[0].clientX - startX;
      const threshold = window.innerWidth * 0.2; // 20% of screen width to switch
      
      tabsWrapper.style.transition = 'transform 0.4s cubic-bezier(0.32, 0.72, 0, 1)';
      
      if (diffX > threshold && currentTabIndex > 0) {
        // Swipe right -> go to previous tab
        (window as any).switchTab(TABS[currentTabIndex - 1]);
      } else if (diffX < -threshold && currentTabIndex < TABS.length - 1) {
        // Swipe left -> go to next tab
        (window as any).switchTab(TABS[currentTabIndex + 1]);
      } else {
        // Snap back
        tabsWrapper.style.transform = `translateX(-${currentTabIndex * 33.3333}%)`;
      }
      isSwiping = false;
    });
  }
  
  // Prevent swipe on horizontal scroll areas
  // (Handled directly inside tabsWrapper touchstart now)
});
