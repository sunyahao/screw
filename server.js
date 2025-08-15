const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { v4: uuidv4 } = require('uuid');
const moment = require('moment');

const app = express();
const PORT = 4444;

// 设置视图引擎
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// 中间件
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// 初始化数据库
const db = new sqlite3.Database('./warehouse.db');

// 创建数据表
db.serialize(() => {
    // 创建入库单表
    db.run(`CREATE TABLE IF NOT EXISTS asn_receipts (
        id TEXT PRIMARY KEY,
        asn_number TEXT UNIQUE NOT NULL,
        supplier_name TEXT NOT NULL,
        supplier_contact TEXT,
        receipt_date TEXT NOT NULL,
        receipt_type TEXT NOT NULL,
        warehouse TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        remarks TEXT,
        total_amount REAL DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`);

    // 创建入库单明细表
    db.run(`CREATE TABLE IF NOT EXISTS asn_receipt_items (
        id TEXT PRIMARY KEY,
        receipt_id TEXT NOT NULL,
        product_name TEXT NOT NULL,
        product_code TEXT,
        specification TEXT,
        quantity INTEGER NOT NULL,
        unit_price REAL NOT NULL,
        total_price REAL NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (receipt_id) REFERENCES asn_receipts(id)
    )`);

    // 插入示例数据
    db.get("SELECT COUNT(*) as count FROM asn_receipts", (err, row) => {
        if (row.count === 0) {
            const sampleId = uuidv4();
            db.run(`INSERT INTO asn_receipts (id, asn_number, supplier_name, supplier_contact, receipt_date, receipt_type, warehouse, status, remarks, total_amount) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
                    [sampleId, 'ASN-20241201-001', '北京供应商有限公司', '13800138000', '2024-12-01', '采购入库', '主仓库', 'completed', '首批入库商品', 15000]);
            
            db.run(`INSERT INTO asn_receipt_items (id, receipt_id, product_name, product_code, specification, quantity, unit_price, total_price) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, 
                    [uuidv4(), sampleId, '笔记本电脑', 'NB001', 'i7/16G/512G', 10, 5000, 50000]);
            
            db.run(`INSERT INTO asn_receipt_items (id, receipt_id, product_name, product_code, specification, quantity, unit_price, total_price) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, 
                    [uuidv4(), sampleId, '无线鼠标', 'MS001', '2.4G无线', 50, 100, 5000]);
        }
    });
});

// 路由
// 主页重定向到ASN管理
app.get('/', (req, res) => {
    res.redirect('/views/asn/manage');
});

// ASN管理页面
app.get('/views/asn/manage', (req, res) => {
    db.all("SELECT * FROM asn_receipts ORDER BY created_at DESC", (err, receipts) => {
        if (err) {
            console.error(err);
            return res.status(500).send('数据库错误');
        }
        res.render('asn/manage', { receipts });
    });
});

// 创建新入库单页面
app.get('/views/asn/create', (req, res) => {
    res.render('asn/create');
});

// 查看入库单详情
app.get('/views/asn/detail/:id', (req, res) => {
    const receiptId = req.params.id;
    
    db.get("SELECT * FROM asn_receipts WHERE id = ?", [receiptId], (err, receipt) => {
        if (err || !receipt) {
            return res.status(404).send('入库单不存在');
        }
        
        db.all("SELECT * FROM asn_receipt_items WHERE receipt_id = ?", [receiptId], (err, items) => {
            if (err) {
                console.error(err);
                return res.status(500).send('数据库错误');
            }
            res.render('asn/detail', { receipt, items });
        });
    });
});

// 创建入库单API
app.post('/api/asn/create', (req, res) => {
    const {
        supplier_name,
        supplier_contact,
        receipt_date,
        receipt_type,
        warehouse,
        remarks,
        items
    } = req.body;

    const receiptId = uuidv4();
    const asnNumber = `ASN-${moment().format('YYYYMMDD')}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
    
    // 计算总金额
    const totalAmount = items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);

    db.serialize(() => {
        db.run("BEGIN TRANSACTION");
        
        // 插入入库单主记录
        db.run(`INSERT INTO asn_receipts (id, asn_number, supplier_name, supplier_contact, receipt_date, receipt_type, warehouse, remarks, total_amount) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [receiptId, asnNumber, supplier_name, supplier_contact, receipt_date, receipt_type, warehouse, remarks, totalAmount],
                function(err) {
                    if (err) {
                        db.run("ROLLBACK");
                        return res.status(500).json({ success: false, message: '创建入库单失败' });
                    }
                    
                    // 插入入库单明细
                    let completed = 0;
                    const total = items.length;
                    
                    if (total === 0) {
                        db.run("COMMIT");
                        return res.json({ success: true, message: '入库单创建成功', receiptId, asnNumber });
                    }
                    
                    items.forEach(item => {
                        const itemId = uuidv4();
                        const totalPrice = item.quantity * item.unit_price;
                        
                        db.run(`INSERT INTO asn_receipt_items (id, receipt_id, product_name, product_code, specification, quantity, unit_price, total_price) 
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                                [itemId, receiptId, item.product_name, item.product_code, item.specification, item.quantity, item.unit_price, totalPrice],
                                function(err) {
                                    if (err) {
                                        db.run("ROLLBACK");
                                        return res.status(500).json({ success: false, message: '创建入库单明细失败' });
                                    }
                                    
                                    completed++;
                                    if (completed === total) {
                                        db.run("COMMIT");
                                        res.json({ success: true, message: '入库单创建成功', receiptId, asnNumber });
                                    }
                                });
                    });
                });
    });
});

// 更新入库单状态
app.post('/api/asn/update-status', (req, res) => {
    const { receiptId, status } = req.body;
    
    db.run("UPDATE asn_receipts SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", 
           [status, receiptId], 
           function(err) {
               if (err) {
                   return res.status(500).json({ success: false, message: '更新状态失败' });
               }
               res.json({ success: true, message: '状态更新成功' });
           });
});

// 删除入库单
app.delete('/api/asn/delete/:id', (req, res) => {
    const receiptId = req.params.id;
    
    db.serialize(() => {
        db.run("BEGIN TRANSACTION");
        
        db.run("DELETE FROM asn_receipt_items WHERE receipt_id = ?", [receiptId], function(err) {
            if (err) {
                db.run("ROLLBACK");
                return res.status(500).json({ success: false, message: '删除入库单明细失败' });
            }
            
            db.run("DELETE FROM asn_receipts WHERE id = ?", [receiptId], function(err) {
                if (err) {
                    db.run("ROLLBACK");
                    return res.status(500).json({ success: false, message: '删除入库单失败' });
                }
                
                db.run("COMMIT");
                res.json({ success: true, message: '删除成功' });
            });
        });
    });
});

// 启动服务器
app.listen(PORT, () => {
    console.log(`ASN入库单管理系统正在运行在 http://localhost:${PORT}`);
    console.log(`访问地址: http://localhost:${PORT}/views/asn/manage`);
});

module.exports = app;