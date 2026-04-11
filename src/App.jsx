import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged 
} from 'firebase/auth';
import { 
  getFirestore, collection, doc, onSnapshot, getDoc,
  updateDoc, deleteDoc, addDoc, setDoc, serverTimestamp 
} from 'firebase/firestore';
import { 
  Camera, Image as ImageIcon, PlusCircle, Package, ShoppingCart, 
  TrendingUp, Plus, Minus, Trash2, Loader2, CheckCircle2, 
  AlertTriangle, Edit3, Save, BellRing, History, X, 
  ListPlus, Tag, Zap, Search, DollarSign, Store, Clock, 
  ChevronDown, ChevronUp, Settings, Sparkles, Filter, 
  ArrowUpDown, User, Lock, LogOut, LineChart, Database
} from 'lucide-react';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = "home-stock-assistant";

const apiKey = ""; 

const commonUnits = ['件', '包', '支', '排', '盒', '罐', '瓶', '袋'];
const commonSuppliers = ['不限', 'HKTVmall', '百佳', '惠康', '萬寧', '屈臣氏', 'DONKI'];

const fetchWithRetry = async (url, options, retries = 5, delay = 1000) => {
  try {
    const response = await fetch(url, options);
    if (!response.ok) {
      let errText = '';
      try { errText = await response.text(); } catch (e) {}
      throw new Error(`HTTP error! status: ${response.status} ${errText}`);
    }
    return await response.json();
  } catch (err) {
    if (retries > 0 && !err.message.includes('401') && !err.message.includes('403') && !err.message.includes('400')) {
      await new Promise(res => setTimeout(res, delay));
      return fetchWithRetry(url, options, retries - 1, delay * 2);
    }
    throw err;
  }
};

const App = () => {
  const [user, setUser] = useState(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [userSettings, setUserSettings] = useState({ defaultMinStock: 2 });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [editSettingsMinStock, setEditSettingsMinStock] = useState(2);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [isAuthLoading, setIsAuthLoading] = useState(false);

  const [items, setItems] = useState([]);
  const [historyLogs, setHistoryLogs] = useState([]);
  const [usageLogs, setUsageLogs] = useState([]); 
  const [categories, setCategories] = useState([]); 
  const [dailyDeals, setDailyDeals] = useState(null); 
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('inventory');
  
  const [filterCat, setFilterCat] = useState('All');
  const [sortBy, setSortBy] = useState('name'); 
  const [analysisFilterCat, setAnalysisFilterCat] = useState('All');
  const [analysisSortBy, setAnalysisSortBy] = useState('daysAsc');

  const [toast, setToast] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null);

  const [modalMode, setModalMode] = useState(null); 
  // 為了支援順利輸入小數點，表單數值預設皆以「字串」狀態保存
  const [itemForm, setItemForm] = useState({ id: null, name: '', category: '未分類', unit: '件', stock: '1', min: '2', track_price: false });
  
  const [adjustStockModal, setAdjustStockModal] = useState(null);
  const [adjustAmount, setAdjustAmount] = useState('1');

  const [newCatName, setNewCatName] = useState('');
  const [isManagingCats, setIsManagingCats] = useState(false);
  const [editingCatOldName, setEditingCatOldName] = useState(null);
  const [editingCatName, setEditingCatName] = useState('');

  const [isUsageLogsOpen, setIsUsageLogsOpen] = useState(false);
  const [editingLogId, setEditingLogId] = useState(null);
  const [editingLogQty, setEditingLogQty] = useState('');

  const [purchaseAmounts, setPurchaseAmounts] = useState({});
  const [aiAdvice, setAiAdvice] = useState(null);
  const [isGeneratingAdvice, setIsGeneratingAdvice] = useState(false);
  
  const [isSearchingDeals, setIsSearchingDeals] = useState(false); 
  const [preferredSupplier, setPreferredSupplier] = useState('不限');
  const [showAlts, setShowAlts] = useState({}); 

  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);

  const showToast = (message) => { setToast(message); setTimeout(() => setToast(null), 3000); };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthChecking(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    const checkAndSeedDefaults = async () => {
      const prefRef = doc(db, 'artifacts', appId, 'users', user.uid, 'settings', 'preferences');
      const snap = await getDoc(prefRef);
      if (!snap.exists() || !snap.data().hasSeededCategories) {
         const defaultCats = ['日用品', '食品', '清潔用品', '保養品'];
         for (const cat of defaultCats) {
           await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'categories'), { name: cat, created_at: serverTimestamp() });
         }
         await setDoc(prefRef, { defaultMinStock: 2, hasSeededCategories: true }, { merge: true });
      }
    };
    checkAndSeedDefaults();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const unsubscribeSettings = onSnapshot(doc(db, 'artifacts', appId, 'users', user.uid, 'settings', 'preferences'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setUserSettings(data);
        setEditSettingsMinStock(data.defaultMinStock || 2);
      }
    });

    const unsubscribeItems = onSnapshot(collection(db, 'artifacts', appId, 'users', user.uid, 'inventory'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setItems(data); setLoading(false);
    });
    
    const unsubscribeHistory = onSnapshot(collection(db, 'artifacts', appId, 'users', user.uid, 'purchase_history'), (snapshot) => {
      const logs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setHistoryLogs(logs.sort((a, b) => (b.purchased_at?.seconds || 0) - (a.purchased_at?.seconds || 0)));
    });

    const unsubscribeUsage = onSnapshot(collection(db, 'artifacts', appId, 'users', user.uid, 'usage_logs'), (snapshot) => {
      const logs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setUsageLogs(logs.sort((a, b) => (b.logged_at?.seconds || 0) - (a.logged_at?.seconds || 0)));
    });
    
    const unsubscribeCat = onSnapshot(collection(db, 'artifacts', appId, 'users', user.uid, 'categories'), (snapshot) => {
      setCategories(snapshot.docs.map(doc => ({ id: doc.id, name: doc.data().name })));
    });
    
    const unsubscribeDeals = onSnapshot(doc(db, 'artifacts', appId, 'users', user.uid, 'system_deals', 'latest'), (docSnap) => {
      if (docSnap.exists()) setDailyDeals(docSnap.data());
    });
    
    return () => { unsubscribeItems(); unsubscribeHistory(); unsubscribeUsage(); unsubscribeCat(); unsubscribeDeals(); unsubscribeSettings(); };
  }, [user]);

  const uniqueItemCats = items.map(i => i.category).filter(Boolean);
  const allCategoryNames = Array.from(new Set([...categories.map(c => c.name), ...uniqueItemCats]));

  // 確保採購數量皆為整數
  useEffect(() => {
    const newAmounts = { ...purchaseAmounts };
    let changed = false;
    items.filter(i => i.in_shopping_list).forEach(item => {
      if (newAmounts[item.id] === undefined) {
        newAmounts[item.id] = Math.max(1, Math.ceil(Number(item.min_stock || 1) * 2 - Number(item.current_stock || 0)));
        changed = true;
      }
    });
    if (changed) setPurchaseAmounts(newAmounts);
  }, [items]);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!email || !password) return setAuthError('請填寫 Email 與密碼');
    setIsAuthLoading(true); setAuthError('');
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      let msg = '驗證失敗，請稍後再試。';
      if (err.code === 'auth/invalid-email') msg = '無效的 Email 格式';
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') msg = 'Email 或密碼錯誤，請確認您已建立該帳號。';
      setAuthError(msg);
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    setIsSettingsOpen(false);
    showToast('已登出帳號');
  };

  const saveSettings = async () => {
    if (!user) return;
    await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'settings', 'preferences'), {
      defaultMinStock: Number(editSettingsMinStock) || 2
    }, { merge: true });
    showToast('個人設定已儲存');
    setIsSettingsOpen(false);
  };

  const triggerSystemReset = () => {
    setConfirmDialog({
      title: '系統重設警告',
      message: '您即將清空帳號下所有的物品、分類與歷史紀錄。\n\n⚠️ 此操作無法復原！確定要清空嗎？',
      confirmText: '確定清空',
      cancelText: '保留資料',
      onConfirm: async () => {
        setLoading(true);
        try {
          for (const item of items) await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'inventory', item.id));
          for (const log of usageLogs) await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'usage_logs', log.id));
          for (const hist of historyLogs) await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'purchase_history', hist.id));
          for (const cat of categories) await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'categories', cat.id));
          showToast('系統已完全重設');
        } catch(e) {
          showToast('重設過程中發生錯誤');
        }
        setConfirmDialog(null);
        setIsSettingsOpen(false);
        setLoading(false);
      }
    });
  };

  const getDisplayedItems = () => {
    let filtered = [...items];
    if (filterCat !== 'All') filtered = filtered.filter(i => i.category === filterCat);
    filtered.sort((a, b) => {
      if (sortBy === 'name') return (a.display_name || '').localeCompare(b.display_name || '', 'zh-TW');
      if (sortBy === 'stockAsc') return (a.current_stock || 0) - (b.current_stock || 0);
      if (sortBy === 'stockDesc') return (b.current_stock || 0) - (a.current_stock || 0);
      if (sortBy === 'recent') return (b.last_updated?.seconds || 0) - (a.last_updated?.seconds || 0);
      return 0;
    });
    return filtered;
  };
  const displayedItems = getDisplayedItems();

  const getRawUsageInsights = () => {
    const insights = [];
    const now = new Date();

    items.forEach(item => {
      const logs = usageLogs
        .filter(log => log.item_id === item.id)
        .sort((a, b) => (a.logged_at?.seconds || 0) - (b.logged_at?.seconds || 0));

      if (logs.length > 0) {
        const firstLogDate = new Date(logs[0].logged_at?.seconds * 1000);
        const daysSinceFirstLog = Math.max(1, (now - firstLogDate) / (1000 * 60 * 60 * 24));
        const totalConsumed = logs.reduce((sum, log) => sum + (Number(log.consumed_qty) || 0), 0);
        
        if (totalConsumed > 0) {
          const dailyUsage = totalConsumed / daysSinceFirstLog;
          const monthlyUsage = Math.round(dailyUsage * 30 * 10) / 10; 
          const daysLeft = dailyUsage > 0 ? Math.floor(item.current_stock / dailyUsage) : 999;
          
          insights.push({ ...item, monthlyUsage, daysLeft, status: daysLeft <= 7 ? 'critical' : daysLeft <= 14 ? 'warning' : 'good' });
        }
      }
    });
    return insights;
  };
  
  const usageInsights = getRawUsageInsights(); 

  const getDisplayedInsights = () => {
    let filteredInsights = [...usageInsights];
    if (analysisFilterCat !== 'All') {
      filteredInsights = filteredInsights.filter(i => i.category === analysisFilterCat);
    }
    filteredInsights.sort((a, b) => {
      if (analysisSortBy === 'daysAsc') return a.daysLeft - b.daysLeft;
      if (analysisSortBy === 'daysDesc') return b.daysLeft - a.daysLeft;
      if (analysisSortBy === 'name') return (a.display_name || '').localeCompare(b.display_name || '', 'zh-TW');
      return 0;
    });
    return filteredInsights; 
  };
  
  const displayedInsights = getDisplayedInsights(); 

  // --- 智能調整庫存 (支援小數點) ---
  const handleConfirmAdjustment = async () => {
    if (!user || !adjustStockModal) return;
    
    const item = adjustStockModal;
    const newStock = Number(adjustAmount);
    
    if (isNaN(newStock) || newStock < 0) {
      showToast('請輸入有效的數字');
      return;
    }

    const delta = Number((newStock - item.current_stock).toFixed(2));

    if (delta === 0) {
      setAdjustStockModal(null);
      return;
    }

    await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'inventory', item.id), {
      current_stock: newStock,
      last_updated: serverTimestamp()
    });

    if (delta < 0) {
      const consumed = Math.abs(delta);
      await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'usage_logs'), {
        item_id: item.id,
        item_name: item.display_name,
        consumed_qty: consumed,
        unit: item.unit || '件',
        logged_at: serverTimestamp()
      });
      showToast(`已記錄消耗 ${consumed} ${item.unit || '件'}`);
    } else {
      showToast(`庫存已增加 ${delta} ${item.unit || '件'}`);
    }

    setAdjustStockModal(null);
  };

  const saveUsageLogEdit = async (logId) => {
    const qty = Number(editingLogQty);
    if (isNaN(qty) || qty <= 0) { showToast('請輸入有效的數字'); return; }
    await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'usage_logs', logId), {
      consumed_qty: qty
    });
    setEditingLogId(null);
    showToast('消耗紀錄已更新');
  };

  const processImageWithAI = async (base64Image) => {
    setScanResult({ status: 'analyzing', message: 'AI 正在精準辨識...' });
    setIsScanning(true);
    try {
      const result = await fetchWithRetry(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: `辨識物品並提供繁體中文 JSON：{ "name": "產品全名", "category": "類別", "unit": "建議單位(如:排/盒/件)" }` },
              { inlineData: { mimeType: "image/png", data: base64Image } }
            ]
          }],
          generationConfig: { responseMimeType: "application/json" }
        })
      });
      setScanResult({ status: 'success', data: JSON.parse(result.candidates[0].content.parts[0].text) });
    } catch (err) { 
      setScanResult({ status: 'error', message: `辨識失敗: 網路異常或影像不清，請手動輸入。` }); 
    }
  };

  const startCamera = async () => {
    setIsScanning(true); setScanResult(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch (err) { setIsScanning(false); showToast('無法開啟相機'); }
  };

  const captureCamera = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    const context = canvasRef.current.getContext('2d');
    canvasRef.current.width = videoRef.current.videoWidth;
    canvasRef.current.height = videoRef.current.videoHeight;
    context.drawImage(videoRef.current, 0, 0);
    const stream = videoRef.current.srcObject;
    if (stream) stream.getTracks().forEach(track => track.stop());
    await processImageWithAI(canvasRef.current.toDataURL('image/png').split(',')[1]);
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => await processImageWithAI(event.target.result.split(',')[1]);
    reader.readAsDataURL(file);
    e.target.value = null; 
  };

  const handleScanSuccess = (aiData) => {
    setIsScanning(false);
    setScanResult(null);
    setModalMode('add');
    const detectedCategory = allCategoryNames.includes(aiData.category) ? aiData.category : (allCategoryNames[0] || '未分類');
    setItemForm({
      id: null,
      name: aiData.name || '',
      category: detectedCategory,
      unit: aiData.unit || '件',
      stock: '1',
      min: String(userSettings.defaultMinStock),
      track_price: false
    });
  };

  const getSimilarItem = (newName) => {
    if (!newName) return null;
    const lowerNew = newName.toLowerCase().trim();
    return items.find(i => {
      const lowerExisting = i.display_name.toLowerCase().trim();
      return lowerExisting.includes(lowerNew) || lowerNew.includes(lowerExisting);
    });
  };

  const proceedToSaveItemForm = async () => {
    const finalStock = Number(itemForm.stock) || 0;
    const finalMin = Number(itemForm.min) || 0;

    if (modalMode === 'add') {
      const exactMatch = items.find(i => i.display_name.toLowerCase() === itemForm.name.trim().toLowerCase());
      if (exactMatch) {
        await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'inventory', exactMatch.id), {
          current_stock: Number((exactMatch.current_stock + finalStock).toFixed(2)), last_updated: serverTimestamp()
        });
        showToast(`物品已完全吻合！自動為「${exactMatch.display_name}」增加庫存`);
      } else {
        await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'inventory'), {
          display_name: itemForm.name.trim(), category: itemForm.category, unit: itemForm.unit || '件',
          current_stock: finalStock, min_stock: finalMin,
          in_shopping_list: false, track_price: itemForm.track_price || false, last_updated: serverTimestamp()
        });
        showToast('已新增品項');
      }
    } else if (modalMode === 'edit') {
      await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'inventory', itemForm.id), {
        display_name: itemForm.name.trim(), category: itemForm.category, unit: itemForm.unit || '件',
        current_stock: finalStock, min_stock: finalMin, track_price: itemForm.track_price || false, last_updated: serverTimestamp()
      });
      showToast('已儲存變更');
    }
    setModalMode(null);
  };

  const saveItemForm = async () => {
    if (!itemForm.name.trim() || !user) { showToast('名稱不可為空'); return; }
    
    if (modalMode === 'add') {
      const exactMatch = items.find(i => i.display_name.toLowerCase() === itemForm.name.trim().toLowerCase());
      const similarItem = getSimilarItem(itemForm.name);
      
      if (!exactMatch && similarItem) {
        setConfirmDialog({
          title: '發現相似物品',
          message: `庫存中已有「${similarItem.display_name}」，這與您輸入的「${itemForm.name}」非常相似。\n\n您確定要將它建立為一個全新的物品嗎？`,
          confirmText: '建立新物品',
          cancelText: '取消',
          onConfirm: async () => {
            await proceedToSaveItemForm();
            setConfirmDialog(null);
          }
        });
        return; 
      }
    }
    await proceedToSaveItemForm();
  };

  const openModal = (mode, item = null) => {
    setModalMode(mode);
    if (mode === 'add') {
      setItemForm({ id: null, name: '', category: filterCat !== 'All' ? filterCat : (allCategoryNames[0] || '未分類'), unit: '件', stock: '1', min: String(userSettings.defaultMinStock), track_price: false });
    } else if (mode === 'edit' && item) {
      setItemForm({ id: item.id, name: item.display_name, category: item.category, unit: item.unit || '件', stock: String(item.current_stock), min: String(item.min_stock), track_price: item.track_price || false });
    }
  };

  const triggerDelete = (title, message, deleteAction) => {
    setConfirmDialog({ 
      title, message, confirmText: '確定刪除', cancelText: '取消',
      onConfirm: async () => { await deleteAction(); setConfirmDialog(null); showToast('已成功刪除'); }
    });
  };

  const toggleShoppingList = async (id, status) => {
    await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'inventory', id), { in_shopping_list: status });
    if(status) showToast('已放入採購單');
  };

  const confirmPurchase = async (item) => {
    if (!user) return;
    const qty = Math.round(purchaseAmounts[item.id] || 1); // 確保購入為整數
    await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'inventory', item.id), {
      current_stock: Number((item.current_stock + qty).toFixed(2)), in_shopping_list: false, last_updated: serverTimestamp()
    });
    await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'purchase_history'), {
      item_id: item.id, item_name: item.display_name, unit: item.unit || '件', purchased_qty: qty, purchased_at: serverTimestamp()
    });
    showToast(`已購入 ${qty} ${item.unit || '件'}「${item.display_name}」`);
  };

  const handleAddCategory = async () => {
    if (!newCatName.trim()) return;
    if (allCategoryNames.includes(newCatName.trim())) { showToast('類別已存在'); return; }
    await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'categories'), { name: newCatName.trim(), created_at: serverTimestamp() });
    setItemForm({ ...itemForm, category: newCatName.trim() });
    setNewCatName('');
  };
  
  const handleEditCategory = async (oldName) => {
    const newName = editingCatName.trim();
    if (!newName || newName === oldName) {
      setEditingCatId(null); setEditingCatName(''); return;
    }
    
    const catDocs = categories.filter(c => c.name === oldName);
    if (catDocs.length > 0) {
      for (const c of catDocs) {
        await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'categories', c.id), { name: newName });
      }
    } else {
      await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'categories'), { name: newName, created_at: serverTimestamp() });
    }

    const itemsToUpdate = items.filter(i => i.category === oldName);
    for (const item of itemsToUpdate) {
      await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'inventory', item.id), { category: newName });
    }

    setEditingCatId(null); setEditingCatName('');
    showToast('分類已更新');
  };

  const handleDeleteCategory = async (catName) => {
    const catDocs = categories.filter(c => c.name === catName);
    for (const c of catDocs) {
      await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'categories', c.id));
    }
    
    const itemsToUpdate = items.filter(i => i.category === catName);
    for (const item of itemsToUpdate) {
      await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'inventory', item.id), { category: '未分類' });
    }
    showToast('分類已刪除');
  };

  const fetchDailyDeals = async () => {
    const itemsToQuery = items.filter(i => i.track_price);
    if (itemsToQuery.length === 0) { showToast("沒有設定追蹤特價的物品。"); return; }
    
    setIsSearchingDeals(true);
    try {
      const itemsData = itemsToQuery.map(i => `- ID:${i.id}, 名稱:${i.display_name}, 尋找單位:${i.unit}`).join('\n');
      const prompt = `請聯網搜尋以下物品最新的價格與優惠（香港地區）。
      ${preferredSupplier !== '不限' ? `⚠️ 請優先尋找【${preferredSupplier}】的報價。` : '請搜尋 HKTVmall, 百佳, 惠康, 萬寧, 屈臣氏等。'}
      
      物品清單：
      ${itemsData}
      
      請回傳 JSON 陣列格式。必須確保它是有效的 JSON，不要加任何其他廢話或 Markdown 標籤。格式範例：
      [
        {
          "id": "填入對應物品的ID",
          "itemName": "物品名稱",
          "lowestPrice": "$價格",
          "seller": "最低價平台",
          "recommendBuy": true,
          "reason": "簡短建議",
          "alternatives": [{"seller": "其他平台", "price": "$價格"}]
        }
      ]`;
      
      const result = await fetchWithRetry(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], tools: [{ google_search: {} }] })
      });
      
      const textResponse = result.candidates?.[0]?.content?.parts?.[0]?.text || "";
      
      let parsedDeals = [];
      try {
        const jsonMatch = textResponse.match(/\[\s*\{[\s\S]*\}\s*\]/);
        if (jsonMatch) {
          parsedDeals = JSON.parse(jsonMatch[0]);
        } else {
          const cleanText = textResponse.replace(/```json/gi, '').replace(/```/g, '').trim();
          parsedDeals = JSON.parse(cleanText);
        }
      } catch (e) {
        throw new Error("AI 回傳格式異常");
      }

      await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'system_deals', 'latest'), {
         deals: parsedDeals, supplier_used: preferredSupplier, updated_at: serverTimestamp()
      });
      showToast("✅ 特價快報已更新！");
      setShowAlts({});
    } catch (err) { 
      let errMsg = "搜尋失敗，請稍後再試。";
      if (err.message.includes('400')) errMsg = "API 請求格式錯誤，請確認 Gemini 搜尋功能已開通。";
      if (err.message.includes('401') || err.message.includes('403')) errMsg = "API 授權失敗，請確認已正確填寫 API Key 且具有搜尋權限。";
      showToast(errMsg); 
    } finally { 
      setIsSearchingDeals(false); 
    }
  };

  const generateAiAdvice = async () => {
    if (!user) return;
    setIsGeneratingAdvice(true);
    try {
      const lowStock = items.filter(i => i.current_stock <= i.min_stock).map(i => i.display_name);
      const inventoryList = items.map(i => `${i.display_name}(${i.current_stock} ${i.unit || '件'})`).join(', ');
      
      const response = await fetchWithRetry(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: `目前的低庫存：${lowStock.join(', ')}。所有庫存：${inventoryList}。請提供簡短的家庭管理建議或可能的晚餐食譜建議。` }] }] })
      });
      setAiAdvice(response.candidates?.[0]?.content?.parts?.[0]?.text || "暫無分析建議");
    } catch (err) { 
      showToast(`AI 分析失敗`); 
    } finally { setIsGeneratingAdvice(false); }
  };

  const formatDate = (ts) => {
    if (!ts || !ts.seconds) return "---";
    const d = new Date(ts.seconds * 1000);
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  };

  // --- 登入畫面 ---
  if (authChecking) return <div className="min-h-screen flex items-center justify-center bg-slate-50"><Loader2 className="animate-spin text-indigo-600" size={40} /></div>;

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center p-4 font-sans text-slate-900">
        <div className="bg-white w-full max-w-sm rounded-3xl p-8 shadow-xl border border-slate-100 animate-in fade-in zoom-in-95">
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center shadow-inner">
              <Package size={32} />
            </div>
          </div>
          <h2 className="text-2xl font-black text-center text-slate-800 mb-2">家居庫存 AI</h2>
          <p className="text-xs text-center text-slate-400 mb-8">本系統僅限授權用戶使用，請登入您的專屬帳號</p>
          
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="text-xs font-bold text-slate-500 mb-1.5 block ml-1 flex items-center gap-1"><User size={12}/> Email 信箱</label>
              <input 
                type="email" required value={email} onChange={e=>setEmail(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 p-3.5 rounded-xl text-sm outline-none focus:ring-2 ring-indigo-200" 
                placeholder="your@email.com" 
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 mb-1.5 block ml-1 flex items-center gap-1"><Lock size={12}/> 密碼</label>
              <input 
                type="password" required value={password} onChange={e=>setPassword(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 p-3.5 rounded-xl text-sm outline-none focus:ring-2 ring-indigo-200" 
                placeholder="輸入密碼" 
              />
            </div>
            
            {authError && <div className="text-xs font-bold text-red-500 bg-red-50 p-2 rounded-lg flex items-center gap-1"><AlertTriangle size={14}/> {authError}</div>}
            
            <button disabled={isAuthLoading} type="submit" className="w-full bg-indigo-600 text-white py-4 rounded-xl font-black text-sm shadow-lg shadow-indigo-600/30 hover:bg-indigo-700 active:scale-95 transition-all flex justify-center items-center gap-2 mt-4">
              {isAuthLoading ? <Loader2 className="animate-spin" size={18}/> : '安全登入'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-24 font-sans relative">
      
      {/* 🌟 Toast - 最上層 z-[200] */}
      {toast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-[200] bg-slate-800 text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-2 animate-in slide-in-from-top-4 w-11/12 max-w-sm">
          <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
          <span className="font-bold text-sm line-clamp-2">{toast}</span>
        </div>
      )}

      {/* 🌟 Confirm Dialog z-[100] */}
      {confirmDialog && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in">
          <div className="bg-white rounded-3xl p-6 w-full max-w-xs shadow-2xl">
            <div className="w-12 h-12 bg-indigo-100 text-indigo-500 rounded-full flex items-center justify-center mb-4"><AlertTriangle size={24} /></div>
            <h3 className="text-xl font-black mb-2">{confirmDialog.title}</h3>
            <p className="text-sm text-slate-500 mb-6 leading-relaxed whitespace-pre-wrap">{confirmDialog.message}</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDialog(null)} className="flex-1 bg-slate-100 text-slate-600 py-3.5 rounded-xl font-bold">{confirmDialog.cancelText || '取消'}</button>
              <button onClick={confirmDialog.onConfirm} className="flex-1 bg-indigo-600 text-white py-3.5 rounded-xl font-bold shadow-md">{confirmDialog.confirmText || '確定'}</button>
            </div>
          </div>
        </div>
      )}

      {/* --- 🎯 防誤觸數量調整 Modal (完美支援小數輸入) z-[80] --- */}
      {adjustStockModal && (
        <div className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl p-6 w-full max-w-xs shadow-2xl relative">
             <button onClick={() => setAdjustStockModal(null)} className="absolute top-4 right-4 text-slate-400 bg-slate-50 rounded-full p-1"><X size={18}/></button>
             
             <div className="mb-4">
                <span className="text-[10px] text-slate-500 font-bold bg-slate-100 px-2 py-1 rounded-md mb-2 inline-block">調整庫存</span>
                <h3 className="text-xl font-black text-slate-800 leading-tight pr-6">{adjustStockModal.display_name}</h3>
                <p className="text-xs text-slate-500 mt-1">目前有：{adjustStockModal.current_stock} {adjustStockModal.unit}</p>
             </div>

             <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 mb-4 flex flex-col items-center">
               <label className="text-[10px] text-slate-400 font-bold mb-2">最新庫存</label>
               <div className="flex items-center justify-center gap-3 w-full">
                  <button onClick={() => setAdjustAmount(prev => String(Math.max(0, Number((Number(prev) - 0.5).toFixed(2)))))} className="w-12 h-12 flex items-center justify-center text-slate-500 bg-white rounded-xl shadow-sm active:bg-slate-100 border border-slate-200 shrink-0"><Minus size={20}/></button>
                  <input 
                    type="number" 
                    step="0.1" 
                    value={adjustAmount} 
                    onChange={e => setAdjustAmount(e.target.value)} 
                    className="font-black text-4xl text-indigo-600 w-24 text-center bg-white border border-indigo-100 rounded-xl outline-none py-1 shadow-inner focus:ring-2 ring-indigo-300" 
                  />
                  <button onClick={() => setAdjustAmount(prev => String(Number((Number(prev) + 0.5).toFixed(2))))} className="w-12 h-12 flex items-center justify-center text-slate-500 bg-white rounded-xl shadow-sm active:bg-slate-100 border border-slate-200 shrink-0"><Plus size={20}/></button>
               </div>
             </div>

             <div className="flex gap-2">
               <button onClick={() => setAdjustAmount('0')} className="bg-slate-100 text-slate-500 px-4 rounded-xl font-bold text-xs whitespace-nowrap active:bg-slate-200">歸零</button>
               <button onClick={handleConfirmAdjustment} className="flex-1 bg-indigo-600 text-white py-3.5 rounded-xl font-black text-sm shadow-md shadow-indigo-600/30 active:scale-95">確認</button>
             </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-30 p-3 shadow-sm">
        <div className="max-w-md mx-auto flex justify-between items-center px-1">
          <h1 className="text-lg font-black text-indigo-600 flex items-center gap-2"><Package size={20}/> 家居庫存 AI</h1>
          <div className="flex items-center gap-1">
            <button onClick={() => openModal('add')} className="p-2 text-slate-400 hover:text-indigo-600"><PlusCircle size={20} /></button>
            <button onClick={() => fileInputRef.current?.click()} className="p-2 text-slate-400 hover:text-indigo-600"><ImageIcon size={20} /><input type="file" ref={fileInputRef} onChange={handleFileUpload} accept="image/*" className="hidden" /></button>
            <button onClick={startCamera} className="ml-1 bg-indigo-600 text-white p-2 rounded-full shadow-md mr-1"><Camera size={18} /></button>
            <button onClick={() => setIsSettingsOpen(true)} className="p-2 text-slate-400 hover:text-indigo-600 bg-slate-50 rounded-full"><Settings size={18} /></button>
          </div>
        </div>
      </header>

      {/* --- 個人設定 Modal z-[70] --- */}
      {isSettingsOpen && (
         <div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
            <div className="bg-white rounded-3xl p-6 w-full max-w-xs shadow-2xl relative">
               <button onClick={() => setIsSettingsOpen(false)} className="absolute top-4 right-4 text-slate-400"><X size={18}/></button>
               <h3 className="text-xl font-black mb-6 flex items-center gap-2 text-indigo-600"><Settings size={20}/> 帳號與設定</h3>
               
               <div className="space-y-6">
                 <div>
                    <label className="text-xs font-bold text-slate-500 mb-2 block">自動預設警戒線數量</label>
                    <div className="flex items-center justify-between bg-slate-50 rounded-xl p-2 border border-slate-200">
                      <button onClick={() => setEditSettingsMinStock(Math.max(0.5, Number((editSettingsMinStock - 0.5).toFixed(2))))} className="p-3 text-slate-400 active:bg-slate-200 rounded-lg"><Minus size={18}/></button>
                      <span className="font-black text-xl text-indigo-600">{editSettingsMinStock}</span>
                      <button onClick={() => setEditSettingsMinStock(Number((editSettingsMinStock + 0.5).toFixed(2)))} className="p-3 text-slate-400 active:bg-slate-200 rounded-lg"><Plus size={18}/></button>
                    </div>
                 </div>

                 <div className="pt-4 border-t border-slate-100">
                    <p className="text-[10px] font-bold text-slate-400 mb-2 block">當前登入帳號</p>
                    <p className="text-sm font-bold text-slate-700 bg-slate-50 px-3 py-2 rounded-lg break-all">{user.email}</p>
                 </div>

                 <div className="flex gap-3 pt-2">
                    <button onClick={saveSettings} className="flex-1 bg-indigo-600 text-white py-3.5 rounded-xl font-bold shadow-md">儲存設定</button>
                    <button onClick={handleLogout} className="flex-1 bg-slate-100 text-slate-600 py-3.5 rounded-xl font-bold flex justify-center items-center gap-1"><LogOut size={16}/> 登出</button>
                 </div>

                 <div className="pt-4 border-t border-slate-100 mt-2">
                    <button onClick={triggerSystemReset} className="w-full text-[11px] font-bold text-red-500 bg-red-50 py-3 rounded-xl border border-red-100 flex items-center justify-center gap-1.5">
                       <AlertTriangle size={14}/> 系統重設 (測試用)
                    </button>
                 </div>
               </div>
            </div>
         </div>
      )}

      {/* --- 管理消耗紀錄 Modal z-[70] --- */}
      {isUsageLogsOpen && (
         <div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
            <div className="bg-white rounded-3xl p-5 w-full max-w-sm shadow-2xl relative max-h-[80vh] flex flex-col">
               <button onClick={() => setIsUsageLogsOpen(false)} className="absolute top-4 right-4 text-slate-400"><X size={18}/></button>
               <h3 className="text-lg font-black mb-1 flex items-center gap-2 text-indigo-600"><Database size={18}/> 消耗紀錄管理</h3>
               <p className="text-[10px] text-slate-500 mb-4 border-b pb-3 border-slate-100">刪除錯誤的紀錄，以免影響 AI 預測準確度。</p>
               
               <div className="overflow-y-auto space-y-2 flex-1 pr-1">
                  {usageLogs.length === 0 && <p className="text-xs text-center text-slate-400 py-6">尚無任何消耗紀錄</p>}
                  {usageLogs.map(log => (
                     <div key={log.id} className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 flex justify-between items-center">
                        {editingLogId === log.id ? (
                           <div className="flex w-full gap-2 items-center">
                              <span className="text-xs font-bold w-12 truncate">{log.item_name}</span>
                              <input type="number" step="0.1" autoFocus className="flex-1 text-xs p-1.5 border rounded outline-none w-full" value={editingLogQty} onChange={e=>setEditingLogQty(e.target.value)} />
                              <button onClick={() => saveUsageLogEdit(log.id)} className="bg-emerald-500 text-white px-2 py-1.5 rounded text-[10px] font-bold">儲存</button>
                              <button onClick={() => setEditingLogId(null)} className="text-slate-400 px-1"><X size={14}/></button>
                           </div>
                        ) : (
                           <>
                              <div>
                                 <div className="font-bold text-slate-700 text-sm flex items-center gap-1.5">
                                    {log.item_name} <span className="text-[10px] bg-red-100 text-red-600 px-1.5 rounded-md">-{log.consumed_qty} {log.unit}</span>
                                 </div>
                                 <div className="text-[9px] text-slate-400 mt-0.5">{formatDate(log.logged_at)}</div>
                              </div>
                              <div className="flex gap-1">
                                 <button onClick={() => {setEditingLogId(log.id); setEditingLogQty(log.consumed_qty);}} className="text-indigo-400 p-1.5 bg-white rounded shadow-sm"><Edit3 size={14}/></button>
                                 <button onClick={() => deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'usage_logs', log.id))} className="text-red-400 p-1.5 bg-white rounded shadow-sm"><Trash2 size={14}/></button>
                              </div>
                           </>
                        )}
                     </div>
                  ))}
               </div>
            </div>
         </div>
      )}

      <main className="max-w-md mx-auto p-3 space-y-4">
        
        {/* --- 儲藏室分頁 --- */}
        {activeTab === 'inventory' && (
          <div className="space-y-4">
            
            <div className="flex gap-2">
              <div className="flex-1 flex items-center bg-white rounded-xl border border-slate-200 px-3 shadow-sm">
                <Filter size={14} className="text-indigo-400 shrink-0" />
                <select value={filterCat} onChange={e=>setFilterCat(e.target.value)} className="w-full bg-transparent p-2.5 text-xs font-bold text-slate-700 outline-none">
                  <option value="All">全部分類</option>
                  {allCategoryNames.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="flex-1 flex items-center bg-white rounded-xl border border-slate-200 px-3 shadow-sm">
                <ArrowUpDown size={14} className="text-indigo-400 shrink-0" />
                <select value={sortBy} onChange={e=>setSortBy(e.target.value)} className="w-full bg-transparent p-2.5 text-xs font-bold text-slate-700 outline-none">
                  <option value="name">名稱排序</option>
                  <option value="stockAsc">庫存:由少至多</option>
                  <option value="stockDesc">庫存:由多至少</option>
                  <option value="recent">最近更新</option>
                </select>
              </div>
            </div>

            {displayedItems.length > 0 ? (
              <div className="grid grid-cols-2 gap-3">
                {displayedItems.map(item => (
                  <div key={item.id} className={`col-span-1 bg-white rounded-2xl p-3 shadow-sm border transition-all flex flex-col h-[135px] justify-between ${item.current_stock <= item.min_stock ? 'border-orange-200 ring-1 ring-orange-100' : 'border-slate-100'}`}>
                    
                    <div className="flex justify-between items-start gap-1">
                      <h3 className="font-bold text-slate-800 text-sm leading-tight line-clamp-2" title={item.display_name}>{item.display_name}</h3>
                      <button onClick={() => openModal('edit', item)} className="text-slate-300 hover:text-indigo-500 p-1 -mt-1 -mr-1 shrink-0"><Edit3 size={14}/></button>
                    </div>
                    
                    <div className="flex flex-wrap gap-1 mt-1 mb-auto">
                      <span className="text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-bold truncate max-w-[60px]">{item.category}</span>
                      {item.track_price && <span className="text-[9px] bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded font-bold flex items-center"><DollarSign size={8}/></span>}
                      {item.current_stock <= item.min_stock && <span className="text-[9px] bg-orange-50 text-orange-600 px-1.5 py-0.5 rounded font-bold flex items-center"><AlertTriangle size={8}/> 低庫存</span>}
                    </div>

                    <div className="flex items-center justify-between pt-2 mt-1 border-t border-slate-50">
                      <div className="flex flex-col">
                         <span className="text-[9px] text-slate-400 flex items-center gap-0.5 whitespace-nowrap" title="最後更新"><Clock size={9}/> {formatDate(item.last_updated)}</span>
                      </div>
                      
                      <div className="flex gap-1.5 items-center">
                        {/* 🌟 橫向顯示數量的按鈕 (防誤觸設計，點擊開啟彈窗) */}
                        <button 
                          onClick={() => { setAdjustStockModal(item); setAdjustAmount(String(item.current_stock)); }} 
                          className="bg-slate-50 hover:bg-indigo-50 border border-slate-100 rounded-lg px-3 py-1.5 flex flex-row items-baseline justify-center transition-colors shadow-sm active:scale-95 gap-1"
                        >
                          <span className={`font-black text-base leading-none ${item.current_stock <= item.min_stock ? 'text-orange-500' : 'text-slate-800'}`}>{item.current_stock}</span>
                          <span className="text-[10px] font-bold text-slate-500 leading-none">{item.unit || '件'}</span>
                        </button>

                        <button 
                          onClick={() => toggleShoppingList(item.id, !item.in_shopping_list)} 
                          className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${item.in_shopping_list ? 'bg-emerald-50 text-emerald-500' : 'bg-slate-50 text-slate-400 hover:bg-indigo-50 hover:text-indigo-500'}`}
                        >
                          {item.in_shopping_list ? <CheckCircle2 size={16}/> : <ShoppingCart size={16}/>}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
               <div className="text-center p-12 bg-white rounded-3xl border border-dashed border-slate-300">
                 <Package size={40} className="mx-auto text-slate-200 mb-3" />
                 <p className="font-bold text-slate-500 text-sm">找不到物品</p>
               </div>
            )}
          </div>
        )}

        {/* --- 分析與追蹤分頁 --- */}
        {activeTab === 'analysis' && (
          <div className="space-y-4 animate-in fade-in">
            
            {/* 📊 數據驅動用量分析 */}
            <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100">
               <div className="flex items-center justify-between mb-3">
                  <h3 className="font-black flex items-center gap-1.5 text-slate-800"><LineChart size={16} className="text-indigo-500"/> 智慧用量預測</h3>
                  <button onClick={() => setIsUsageLogsOpen(true)} className="text-[9px] text-indigo-500 font-bold bg-indigo-50 px-2 py-1 rounded-md flex items-center gap-1"><Database size={10}/> 紀錄</button>
               </div>
               <p className="text-[10px] text-slate-500 mb-3 leading-relaxed">系統會根據您手動扣除庫存的「實際消耗紀錄」，預測剩餘物品何時會用完。</p>
               
               {/* 💡 分析預測區的過濾與排序 */}
               {usageInsights.length > 0 && (
                 <div className="flex gap-2 mb-4">
                    <div className="flex-1 flex items-center bg-slate-50 rounded-lg border border-slate-100 px-2">
                      <Filter size={12} className="text-slate-400 shrink-0" />
                      <select value={analysisFilterCat} onChange={e=>setAnalysisFilterCat(e.target.value)} className="w-full bg-transparent p-1.5 text-[10px] font-bold text-slate-600 outline-none">
                        <option value="All">全部分類</option>
                        {allCategoryNames.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div className="flex-1 flex items-center bg-slate-50 rounded-lg border border-slate-100 px-2">
                      <ArrowUpDown size={12} className="text-slate-400 shrink-0" />
                      <select value={analysisSortBy} onChange={e=>setAnalysisSortBy(e.target.value)} className="w-full bg-transparent p-1.5 text-[10px] font-bold text-slate-600 outline-none">
                        <option value="daysAsc">最快用完</option>
                        <option value="daysDesc">最慢用完</option>
                        <option value="name">名稱排序</option>
                      </select>
                    </div>
                 </div>
               )}

               {displayedInsights.length > 0 ? (
                 <div className="space-y-3">
                   {displayedInsights.map(insight => (
                      <div key={insight.id} className="bg-slate-50 rounded-2xl p-3 border border-slate-100 flex items-center justify-between">
                         <div>
                            <div className="flex items-center gap-2 mb-1">
                               <span className="font-bold text-slate-800 text-sm">{insight.display_name}</span>
                               {insight.status === 'critical' && <span className="bg-red-50 text-red-500 text-[8px] font-black px-1.5 py-0.5 rounded">即將用罄</span>}
                            </div>
                            <p className="text-[10px] text-slate-500">預估月消耗：{insight.monthlyUsage} {insight.unit || '件'}</p>
                         </div>
                         <div className="text-right">
                            <p className="text-[10px] text-slate-400 mb-0.5">預計可用</p>
                            <p className={`font-black text-lg leading-none ${insight.status === 'critical' ? 'text-red-500' : insight.status === 'warning' ? 'text-orange-500' : 'text-emerald-500'}`}>
                               {insight.daysLeft > 900 ? '充足' : insight.daysLeft} <span className="text-[10px] font-bold">{insight.daysLeft > 900 ? '' : '天'}</span>
                            </p>
                            {insight.status !== 'good' && !insight.in_shopping_list && (
                               <button onClick={() => toggleShoppingList(insight.id, true)} className="mt-1.5 text-[9px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100 shadow-sm active:scale-95">加採購單</button>
                            )}
                         </div>
                      </div>
                   ))}
                 </div>
               ) : usageInsights.length > 0 ? (
                 <p className="text-xs text-center text-slate-400 py-4">無符合條件的預測資料</p>
               ) : (
                 <div className="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-6 text-center">
                    <p className="text-[11px] text-slate-400 leading-relaxed">目前累積的紀錄不足以進行預測。<br/>當您在庫存卡片上點擊數量並<strong className="text-slate-600">調降庫存</strong>時，系統就會自動記錄消耗速度！</p>
                 </div>
               )}
            </div>

            <div className="bg-slate-900 rounded-3xl p-5 shadow-xl text-white">
               <div className="flex items-center justify-between mb-3">
                 <h3 className="font-black flex items-center gap-1.5 text-yellow-400"><Zap size={16} className="fill-yellow-400"/> 每日特價快報</h3>
                 <span className="text-[9px] text-slate-400 flex items-center gap-1"><Clock size={10}/> {dailyDeals?.updated_at ? formatDate(dailyDeals.updated_at) : '尚未更新'}</span>
               </div>
               
               <div className="flex items-center gap-2 mb-4 bg-white/5 p-1.5 rounded-lg border border-white/10">
                  <span className="text-[10px] text-slate-400 pl-2 shrink-0">平台:</span>
                  <select 
                    className="bg-transparent text-xs font-bold text-white outline-none flex-1 truncate"
                    value={preferredSupplier} onChange={e => setPreferredSupplier(e.target.value)}
                  >
                    {commonSuppliers.map(s => <option key={s} value={s} className="text-slate-900">{s}</option>)}
                  </select>
                  <button 
                    onClick={fetchDailyDeals} 
                    disabled={isSearchingDeals || items.filter(i=>i.track_price).length === 0}
                    className="bg-yellow-400 text-slate-900 text-[10px] px-3 py-1.5 rounded-md font-black flex items-center gap-1 disabled:opacity-50 shadow-lg shadow-yellow-400/20"
                  >
                    {isSearchingDeals ? <Loader2 className="animate-spin" size={12}/> : <Search size={12}/>} 更新
                  </button>
               </div>

               {dailyDeals?.deals && dailyDeals.deals.length > 0 && !isSearchingDeals ? (
                 <div className="space-y-3 mt-2 animate-in slide-in-from-bottom-4">
                   {dailyDeals.deals.map((deal, idx) => {
                      const linkedItem = items.find(i => i.id === deal.id || i.display_name === deal.itemName);
                      return (
                        <div key={idx} className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/10 flex flex-col gap-3">
                           <div className="flex justify-between items-start">
                             <div>
                                <h4 className="font-black text-sm text-white mb-1">{deal.itemName}</h4>
                                <div className="flex items-center gap-1 text-[10px] text-slate-300 font-medium">
                                   <Store size={12}/> {deal.seller}
                                </div>
                             </div>
                             <div className="text-right shrink-0 ml-2">
                                <div className="text-lg font-black text-yellow-400">{deal.lowestPrice}</div>
                             </div>
                           </div>
                           
                           <div className="flex items-center justify-between pt-3 border-t border-white/10">
                              <span className="text-xs text-slate-300 pr-2 leading-tight">{deal.reason}</span>
                              {deal.recommendBuy ? (
                                 <span className="shrink-0 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-1 rounded-lg text-[10px] font-black flex items-center gap-0.5"><CheckCircle2 size={12}/> 建議</span>
                              ) : (
                                 <span className="shrink-0 bg-slate-500/20 text-slate-300 border border-slate-500/30 px-2 py-1 rounded-lg text-[10px] font-bold">觀望</span>
                              )}
                           </div>

                           <div className="flex items-center justify-between mt-1">
                              <button 
                                onClick={() => setShowAlts(prev => ({...prev, [deal.id]: !prev[deal.id]}))}
                                className="text-[10px] text-slate-400 flex items-center gap-0.5 hover:text-white"
                              >
                                {deal.alternatives?.length > 0 ? (showAlts[deal.id] ? <><ChevronUp size={12}/> 收起</> : <><ChevronDown size={12}/> 其他</>) : '無其他'}
                              </button>
                              
                              {linkedItem && !linkedItem.in_shopping_list && (
                                 <button onClick={() => toggleShoppingList(linkedItem.id, true)} className="bg-indigo-500 text-white px-2 py-1 rounded text-[9px] font-black flex items-center gap-0.5 shadow-md active:scale-95"><ShoppingCart size={10}/> 加入採購</button>
                              )}
                              {linkedItem && linkedItem.in_shopping_list && (
                                 <span className="text-[9px] text-emerald-400 flex items-center gap-0.5"><CheckCircle2 size={10}/> 已在清單</span>
                              )}
                           </div>

                           {showAlts[deal.id] && deal.alternatives?.length > 0 && (
                             <div className="mt-1 pt-2 border-t border-dashed border-white/10 space-y-1.5 animate-in slide-in-from-top-2">
                               {deal.alternatives.map((alt, i) => (
                                 <div key={i} className="flex justify-between text-[10px] text-slate-300">
                                   <span>{alt.seller}</span>
                                   <span className="font-bold text-white">{alt.price}</span>
                                 </div>
                               ))}
                             </div>
                           )}
                        </div>
                      )
                   })}
                 </div>
               ) : !isSearchingDeals && (
                 <div className="bg-white/5 border border-dashed border-white/20 rounded-2xl p-6 text-center">
                    <p className="text-xs text-slate-400">目前沒有特價資料，點擊上方按鈕開始搜尋。</p>
                 </div>
               )}
            </div>

            <div className="bg-indigo-600 rounded-3xl p-5 shadow-xl text-white relative overflow-hidden">
              <Sparkles className="absolute top-0 right-0 text-white/10 w-24 h-24 -mr-4 -mt-4" />
              <div className="relative z-10">
                <h3 className="font-black flex items-center gap-1.5 mb-2 text-sm"><Zap size={14}/> 庫存管理與食譜</h3>
                {isGeneratingAdvice ? (
                  <div className="flex items-center gap-2 text-xs text-indigo-100"><Loader2 className="animate-spin" size={14}/> 分析中...</div>
                ) : aiAdvice ? (
                  <div className="text-xs leading-relaxed text-indigo-50 whitespace-pre-wrap bg-white/10 p-3 rounded-xl">{aiAdvice}</div>
                ) : (
                  <p className="text-xs text-indigo-200 mb-3">讓 AI 幫你分析庫存並提供食譜建議。</p>
                )}
                <button onClick={generateAiAdvice} className="mt-2 bg-white text-indigo-600 px-4 py-2 rounded-lg font-bold text-xs shadow-md active:scale-95">
                  {aiAdvice ? '重新分析' : '開始分析'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* --- 採購單分頁 --- */}
        {activeTab === 'shopping' && (
          <div className="space-y-4 animate-in fade-in">
            <h2 className="text-xs font-bold text-slate-400 px-1 uppercase tracking-widest">待辦採購</h2>
            <div className="grid grid-cols-1 gap-3">
              {items.filter(i => i.in_shopping_list).map(item => (
                <div key={item.id} className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <p className="font-black text-slate-800 text-base leading-tight">{item.display_name}</p>
                      <p className="text-[9px] text-slate-500 font-bold mt-1">庫存: {item.current_stock} / 警戒: {item.min_stock} {item.unit || '件'}</p>
                    </div>
                    <button onClick={() => toggleShoppingList(item.id, false)} className="text-slate-400 p-1"><X size={16}/></button>
                  </div>
                  <div className="flex items-center justify-between bg-indigo-50/50 p-2 rounded-xl border border-indigo-50">
                    <div className="flex items-center gap-1.5">
                       <span className="text-[10px] font-bold text-indigo-700 ml-1">購入:</span>
                       <div className="flex items-center gap-1 bg-white rounded-lg p-0.5 border border-indigo-100">
                         <button onClick={() => setPurchaseAmounts({...purchaseAmounts, [item.id]: Math.max(1, Math.round(purchaseAmounts[item.id]||1)-1)})} className="p-1 text-indigo-400"><Minus size={14}/></button>
                         <span className="text-sm font-black text-indigo-700 w-5 text-center">{Math.round(purchaseAmounts[item.id] || 1)}</span>
                         <button onClick={() => setPurchaseAmounts({...purchaseAmounts, [item.id]: Math.round(purchaseAmounts[item.id]||1)+1})} className="p-1 text-indigo-400"><Plus size={14}/></button>
                       </div>
                       <span className="text-[10px] font-bold text-indigo-600">{item.unit || '件'}</span>
                    </div>
                    <button onClick={() => confirmPurchase(item)} className="bg-indigo-600 text-white px-3 py-2 rounded-lg text-xs font-bold shadow-md active:scale-95 flex items-center gap-1"><CheckCircle2 size={14}/> 確認</button>
                  </div>
                </div>
              ))}
              {items.filter(i => i.in_shopping_list).length === 0 && <div className="text-center py-8 text-slate-400 text-sm">清單空空如也</div>}
            </div>

            <div className="pt-2">
              <h2 className="text-xs font-bold text-slate-400 px-1 uppercase tracking-widest mb-2 flex items-center gap-1"><History size={12}/> 歷史紀錄</h2>
              <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm space-y-3">
                {historyLogs.slice(0, 10).map(log => (
                  <div key={log.id} className="flex justify-between items-center text-xs border-b border-slate-50 pb-2 last:border-0 last:pb-0">
                    <div>
                      <span className="font-bold text-slate-800">{log.item_name}</span>
                      <span className="text-[10px] text-emerald-600 ml-1.5 font-black">+{log.purchased_qty} {log.unit || '件'}</span>
                      <div className="text-[9px] text-slate-400 mt-0.5">{formatDate(log.purchased_at)}</div>
                    </div>
                    <button onClick={() => triggerDelete('刪除紀錄？', '', () => deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'purchase_history', log.id)))} className="text-slate-300 p-1.5"><Trash2 size={14}/></button>
                  </div>
                ))}
                {historyLogs.length === 0 && <p className="text-[10px] text-center text-slate-400 py-2">無紀錄</p>}
              </div>
            </div>
          </div>
        )}

        {/* --- 共用新增/編輯 Modal (完美支援小數點輸入) z-50 --- */}
        {modalMode && (
          <div className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm flex items-end sm:items-center p-0 sm:p-4 animate-in fade-in">
             <div className="bg-white rounded-t-3xl sm:rounded-3xl p-5 w-full max-w-sm relative max-h-[90vh] overflow-y-auto animate-in slide-in-from-bottom-full duration-300 mx-auto">
                <button onClick={() => setModalMode(null)} className="absolute top-4 right-4 p-1.5 text-slate-400 bg-slate-100 rounded-full"><X size={18}/></button>
                <h2 className="text-lg font-black mb-5 flex items-center gap-2 text-indigo-600">
                  {modalMode === 'add' ? <PlusCircle size={20}/> : <Edit3 size={20}/>} 
                  {modalMode === 'add' ? '新增物品' : '編輯物品'}
                </h2>
                <div className="space-y-4">
                   <div>
                     <label className="text-[10px] font-bold text-slate-500 mb-1 block">名稱</label>
                     <input type="text" className="w-full bg-slate-50 p-3 rounded-xl outline-none border border-slate-200 font-bold text-sm" value={itemForm.name} onChange={e => setItemForm({...itemForm, name: e.target.value})} placeholder="例如：雞蛋" />
                   </div>
                   
                   <div className="space-y-1.5">
                     <label className="text-[10px] font-bold text-slate-500 flex justify-between">單位</label>
                     <div className="flex flex-wrap gap-1.5">
                       {commonUnits.map(u => <button key={u} onClick={() => setItemForm({...itemForm, unit: u})} className={`px-2 py-1 rounded text-[10px] font-bold border ${itemForm.unit === u ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-white text-slate-600'}`}>{u}</button>)}
                       <input type="text" placeholder="自訂" className="w-16 px-1.5 py-1 text-[10px] border border-slate-200 rounded" value={itemForm.unit} onChange={e=>setItemForm({...itemForm, unit: e.target.value})} />
                     </div>
                   </div>

                   <div className="space-y-1.5">
                     <label className="text-[10px] font-bold text-slate-500 flex justify-between items-center">
                       類別 <button onClick={() => setIsManagingCats(true)} className="text-indigo-500 flex items-center gap-0.5"><Settings size={10}/> 管理所有分類</button>
                     </label>
                     <select className="w-full bg-white border border-slate-200 p-2.5 rounded-xl text-xs font-bold" value={itemForm.category} onChange={e => setItemForm({...itemForm, category: e.target.value})}>
                        {allCategoryNames.map(c => <option key={c} value={c}>{c}</option>)}
                     </select>
                   </div>
                   
                   <div className="flex gap-3">
                      {modalMode === 'add' && (
                        <div className="flex-1">
                          <label className="text-[10px] font-bold text-slate-500 mb-1 block text-center">初始 ({itemForm.unit})</label>
                          <div className="flex items-center justify-between bg-slate-50 rounded-xl p-1.5 border border-slate-200">
                            <button onClick={() => setItemForm({...itemForm, stock: String(Math.max(0, Number((Number(itemForm.stock)-0.5).toFixed(2))))})} className="p-2 text-slate-400"><Minus size={16}/></button>
                            <input type="number" step="0.1" value={itemForm.stock} onChange={e => setItemForm({...itemForm, stock: e.target.value})} className="font-bold text-lg w-12 text-center bg-transparent outline-none" />
                            <button onClick={() => setItemForm({...itemForm, stock: String(Number((Number(itemForm.stock)+0.5).toFixed(2)))})} className="p-2 text-slate-400"><Plus size={16}/></button>
                          </div>
                        </div>
                      )}
                      <div className="flex-1">
                        <label className="text-[10px] font-bold text-orange-500 mb-1 block text-center">警戒 ({itemForm.unit})</label>
                        <div className="flex items-center justify-between bg-orange-50 rounded-xl p-1.5 border border-orange-100">
                          <button onClick={() => setItemForm({...itemForm, min: String(Math.max(0, Number((Number(itemForm.min)-0.5).toFixed(2))))})} className="p-2 text-orange-400"><Minus size={16}/></button>
                          <input type="number" step="0.1" value={itemForm.min} onChange={e => setItemForm({...itemForm, min: e.target.value})} className="font-bold text-lg text-orange-600 w-12 text-center bg-transparent outline-none" />
                          <button onClick={() => setItemForm({...itemForm, min: String(Number((Number(itemForm.min)+0.5).toFixed(2)))})} className="p-2 text-orange-400"><Plus size={16}/></button>
                        </div>
                      </div>
                   </div>
                   <div className="flex items-center justify-between bg-slate-50 p-3 rounded-xl border border-slate-200">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700"><Search size={14} className="text-indigo-500" /> 特價追蹤</div>
                      <button onClick={() => setItemForm({...itemForm, track_price: !itemForm.track_price})} className={`w-10 h-5 rounded-full relative transition-colors ${itemForm.track_price ? 'bg-indigo-500' : 'bg-slate-300'}`}>
                        <div className={`w-3.5 h-3.5 bg-white rounded-full absolute top-[3px] transition-transform ${itemForm.track_price ? 'translate-x-5' : 'translate-x-1'}`}></div>
                      </button>
                   </div>

                   <button onClick={saveItemForm} className="w-full bg-indigo-600 text-white py-3.5 rounded-xl font-bold text-sm shadow-md active:scale-95">確認儲存</button>
                   
                   {/* 刪除按鈕 */}
                   {modalMode === 'edit' && (
                     <button 
                       onClick={() => triggerDelete('刪除物品', `確定要永久刪除「${itemForm.name}」嗎？`, () => {
                         deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'inventory', itemForm.id));
                         setModalMode(null);
                       })} 
                       className="w-full mt-2 bg-red-50 text-red-600 py-3.5 rounded-xl font-bold text-sm border border-red-100 active:bg-red-100 flex items-center justify-center gap-1"
                     >
                       <Trash2 size={16}/> 刪除此物品
                     </button>
                   )}
                </div>
             </div>
          </div>
        )}

        {/* --- 類別管理 Modal (管理所有類別) z-[100] --- */}
        {isManagingCats && (
           <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
              <div className="bg-white rounded-3xl p-5 w-full max-w-xs shadow-2xl relative">
                 <button onClick={() => setIsManagingCats(false)} className="absolute top-4 right-4 text-slate-400"><X size={18}/></button>
                 <h3 className="text-lg font-black mb-4 flex items-center gap-2"><Settings size={18}/> 管理所有分類</h3>
                 
                 <div className="flex gap-2 mb-4">
                   <input type="text" placeholder="新增分類..." className="flex-1 bg-slate-50 border border-slate-200 p-2 rounded-xl text-sm outline-none font-bold" value={newCatName} onChange={(e) => setNewCatName(e.target.value)} />
                   <button onClick={handleAddCategory} className="bg-indigo-600 text-white px-3 rounded-xl font-bold text-xs shadow-sm">新增</button>
                 </div>

                 <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                    {allCategoryNames.length === 0 && <p className="text-xs text-center text-slate-400 py-2">尚無自訂分類</p>}
                    {allCategoryNames.map(catName => (
                       <div key={catName} className="flex justify-between items-center bg-slate-50 p-2 rounded-lg border border-slate-100">
                          {editingCatOldName === catName ? (
                             <div className="flex w-full gap-1">
                                <input autoFocus className="flex-1 text-xs p-1 border rounded font-bold outline-none bg-white" value={editingCatName} onChange={e=>setEditingCatName(e.target.value)} />
                                <button onClick={() => handleEditCategory(catName)} className="bg-emerald-500 text-white px-2 rounded text-[10px]"><Save size={12}/></button>
                             </div>
                          ) : (
                             <>
                                <span className="text-sm font-bold text-slate-700">{catName}</span>
                                <div className="flex gap-1">
                                   <button onClick={() => {setEditingCatOldName(catName); setEditingCatName(catName);}} className="text-indigo-400 p-1 bg-white rounded shadow-sm hover:bg-indigo-50"><Edit3 size={12}/></button>
                                   <button onClick={() => triggerDelete('刪除分類', `確定刪除「${catName}」？\n所有屬於此分類的物品都會被變更為「未分類」。`, () => handleDeleteCategory(catName))} className="text-red-400 p-1 bg-white rounded shadow-sm hover:bg-red-50"><Trash2 size={12}/></button>
                                </div>
                             </>
                          )}
                       </div>
                    ))}
                 </div>
              </div>
           </div>
        )}

        {/* 相機介面 (改為成功後打開表單) */}
        {isScanning && (
          <div className="fixed inset-0 z-50 bg-black flex flex-col p-6 animate-in fade-in">
             <div className="relative aspect-[3/4] w-full max-w-sm mx-auto rounded-3xl overflow-hidden border-2 border-indigo-400 mt-4">
                <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
                <canvas ref={canvasRef} className="hidden" />
             </div>
             <div className="mt-auto mb-6 text-center">
                {scanResult?.status === 'analyzing' ? (
                  <div className="text-white space-y-4"><Loader2 className="animate-spin text-indigo-400 mx-auto" size={48} /><p>AI 辨識中...</p></div>
                ) : scanResult?.status === 'success' ? (
                  <div className="bg-white rounded-3xl p-5 text-left shadow-2xl">
                    <span className="text-[10px] font-bold text-indigo-500 bg-indigo-50 px-2 py-1 rounded-md">{scanResult.data.category}</span>
                    <h3 className="text-xl font-black text-slate-800 my-2">{scanResult.data.name}</h3>
                    <p className="text-xs text-slate-500 mb-4 font-medium">建議單位: {scanResult.data.unit}</p>
                    <div className="flex gap-2">
                      <button onClick={() => handleScanSuccess(scanResult.data)} className="flex-1 bg-indigo-600 text-white py-3 rounded-xl font-bold text-sm shadow-lg">確認並編輯</button>
                      <button onClick={() => { setIsScanning(false); setScanResult(null); }} className="flex-1 bg-slate-100 py-3 rounded-xl font-bold text-slate-600 text-sm">取消</button>
                    </div>
                  </div>
                ) : (
                  <div className="text-white space-y-6">
                    <button onClick={captureCamera} className="w-20 h-20 bg-white rounded-full mx-auto flex items-center justify-center active:scale-90">
                      <div className="w-16 h-16 border-4 border-slate-200 rounded-full" />
                    </button>
                    <button onClick={() => { setIsScanning(false); const stream = videoRef.current?.srcObject; if(stream) stream.getTracks().forEach(t=>t.stop()); }} className="text-slate-300 bg-white/10 px-6 py-2 rounded-full font-bold text-sm">關閉相機</button>
                  </div>
                )}
             </div>
          </div>
        )}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-xl border-t flex justify-between items-center z-40 pb-safe shadow-[0_-4px_20px_rgba(0,0,0,0.05)] px-2">
        <button onClick={() => setActiveTab('inventory')} className={`flex flex-col items-center justify-center w-full py-2.5 transition-all ${activeTab === 'inventory' ? 'text-indigo-600' : 'text-slate-400'}`}>
          <Package size={22} strokeWidth={activeTab === 'inventory' ? 2.5 : 2}/>
          <span className="text-[9px] font-black mt-1">儲藏室</span>
        </button>
        <button onClick={() => setActiveTab('analysis')} className={`flex flex-col items-center justify-center w-full py-2.5 transition-all ${activeTab === 'analysis' ? 'text-indigo-600' : 'text-slate-400'}`}>
          <TrendingUp size={22} strokeWidth={activeTab === 'analysis' ? 2.5 : 2}/>
          <span className="text-[9px] font-black mt-1">分析與追蹤</span>
        </button>
        <button onClick={() => setActiveTab('shopping')} className={`flex flex-col items-center justify-center w-full py-2.5 relative transition-all ${activeTab === 'shopping' ? 'text-indigo-600' : 'text-slate-400'}`}>
          <div className="relative">
             <ShoppingCart size={22} strokeWidth={activeTab === 'shopping' ? 2.5 : 2}/>
             {items.filter(i => i.in_shopping_list).length > 0 && <span className="absolute -top-1.5 -right-2.5 bg-red-500 text-white text-[8px] font-black w-4 h-4 flex items-center justify-center rounded-full border border-white">{items.filter(i => i.in_shopping_list).length}</span>}
          </div>
          <span className="text-[9px] font-black mt-1">採購單</span>
        </button>
      </nav>
      <div className="h-5 bg-white/95 fixed bottom-0 left-0 right-0 z-30 pointer-events-none"></div>
    </div>
  );
};

export default App;