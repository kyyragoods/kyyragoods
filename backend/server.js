const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const path = require('path');
const bodyParser = require('body-parser');
const fs = require('fs');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '../frontend')));
app.use('/assets', express.static('frontend/assets'));


let codes = {};

app.post('/submit-code', (req, res) => {
    const { code, customer_no, buyer_sku_code, kyyra } = req.body;
    if (!codes[code]) {
        codes[code] = { confirmed: false, date: new Date(), customer_no, buyer_sku_code, kyyra};
    }
    res.redirect(`/status-transaksi=${code}`);
});

app.get('/status-transaksi=:code', (req, res) => {
    const { code } = req.params;
    const transaction = codes[code];
    const status = transaction && transaction.confirmed ? 'sudah dikonfirmasi' : 'belum dikonfirmasi';

    console.log(`ID: ${transaction?.customer_no}, Code: ${code}, Buyer SKU Code: ${transaction?.buyer_sku_code}`);
    res.send(`<h1>ID: ${transaction?.customer_no} - Status Transaksi</h1><p>Kode: ${code} - Status: ${status} - Buyer SKU Code: ${transaction?.buyer_sku_code} - ID: ${transaction?.customer_no} - harga: ${transaction?.kyyra}</p><a href="/">Kembali</a>`);
});

app.post('/admin/next/', (req, res) => {
    const { code, customer_no, buyer_sku_code, kyyra } = req.body;
    if (code && customer_no && buyer_sku_code && kyyra) {
        res.redirect(`/next?code=${code}&customer_no=${customer_no}&buyer_sku_code=${buyer_sku_code}&kyyra=${kyyra}`);
    } else {
        res.send("Some values are missing");
    }
});

app.get('/next', (req, res) => {
    const { code, customer_no, buyer_sku_code, kyyra } = req.query;
    console.log(req.query);
    res.send(`
        <h1>Detail Transaksi</h1>
        <p>Kode: ${code}</p>
        <p>Customer No: ${customer_no}</p>
        <p>Buyer SKU Code: ${buyer_sku_code}</p>
        <p>Harga: ${'Rp. ' + Math.floor(kyyra).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}</p>
        
        <!-- Form untuk mengirimkan request POST ke /api/transaction -->
        <form action="/api/transaction" method="POST">
            <input type="hidden" name="buyer_sku_code" value="${buyer_sku_code}">
            <input type="hidden" name="customer_no" value="${customer_no}">
            <input type="hidden" name="ref_id" value="${code}"> <!-- Menggunakan 'code' sebagai ref_id -->
            <button type="submit">Konfirmasi</button>
        </form>

        <a href="/">Kembali</a>
    `);
});

app.post('/admin/confirm-code', (req, res) => {
    const { code } = req.body;
    const transaction = codes[code];
    if (codes[code]) {
        codes[code].confirmed = true;
    }
    res.redirect(`/admin=${code}`);
});

app.post('/admin/delete-code', (req, res) => {
    const { code } = req.body;
    delete codes[code];
    res.redirect('/admin');
});

app.get('/admin', (req, res) => {
    const codeList = Object.keys(codes).map(code => {
        const daysSince = Math.floor((new Date() - codes[code].date) / (1000 * 60 * 60 * 24));
        return `
            <li>
                Harga: ${'Rp. ' + Math.floor(codes[code].kyyra).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')} Kode: ${code} - ${daysSince} hari yang lalu - Status: ${codes[code].confirmed ? 'sudah dikonfirmasi' : 'belum dikonfirmasi'}
                <form action="/admin/delete-code" method="POST" style="display:inline;">
                    <input type="hidden" name="code" value="${code}">
                    <button type="submit">Hapus</button>
                </form>
                <form action="/admin/next/" method="POST" style="display:inline;">
                    <input type="hidden" name="code" value="${code}">
                    <input type="hidden" name="customer_no" value="${codes[code]?.customer_no}">
                    <input type="hidden" name="buyer_sku_code" value="${codes[code]?.buyer_sku_code}">
                    <input type="hidden" name="kyyra" value="${codes[code]?.kyyra}">
                    <button type="submit">next</button>
                </form>
            </li>`;
    }).join('');
    
    res.send(`
        <h1>Konfirmasi Kode</h1>
        <form action="/admin/confirm-code" method="POST">
            <input type="text" name="code" required>
            <button type="submit">Konfirmasi</button>
        </form>
        <h2>List Kode yang Dikirimkan</h2>
        <ul>
            ${codeList}
        </ul>
        <form action="/api/update-cache" method="POST">
            <button type="submit">Perbarui Cache</button>
        </form>
        <a href="/">Kembali ke Halaman Utama</a>
    `);
});

const credentialsPath = path.join(__dirname, 'credentials.json');
let credentials;

try {
    credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
} catch (error) {
    console.error('Error loading credentials:', error);
    process.exit(1);
}

const username = credentials.username;
const apiKey = credentials.apiKey;
const cache = {
    data: null
};

app.post('/api/update-cache', async (req, res) => {
    try {
        cache.data = await fetchPriceList();
        res.send('Cache berhasil diperbarui.');
    } catch (error) {
        console.error('Error updating cache:', error);
        res.status(500).send('Gagal memperbarui cache.');
    }
});

let config = loadConfig();
function loadConfig() {
    try {
        const configPath = path.join(__dirname, 'config.json');
        return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (error) {
        console.error('Error loading configuration:', error);
        return { prefixes: [], brands: {}, customProfits: {} };
    }
}


function calculatePriceWithProfit(price, brand, buyer_sku_code) {
    const brandConfig = config.brands[brand] || {};
    const fixedProfit = brandConfig.fixedProfit || 0;
    const percentageProfit = brandConfig.percentageProfit || 0;

    const customProfits = config.customProfits || {};
    const customProfit = customProfits[buyer_sku_code] || {};

    const customFixedProfit = customProfit.fixedProfit || 0;
    const customPercentageProfit = customProfit.percentageProfit || 0;

    return price + fixedProfit + customFixedProfit + (price * (percentageProfit + customPercentageProfit));
}

async function fetchPriceList() {
    const sign = crypto.createHash('md5').update(username + apiKey + 'pricelist').digest('hex');
    const response = await axios.post('https://api.digiflazz.com/v1/price-list', {
        cmd: 'prepaid',
        username,
        sign
    });
    const products = response.data.data;
    const prefixes = config.prefixes || [];

    products.forEach(product => {
        let trimmedProductName = product.product_name;
        prefixes.forEach(prefix => {
            trimmedProductName = trimmedProductName.replace(new RegExp(`^${prefix}`), '');
        });
        product.hargakyyra = calculatePriceWithProfit(product.price, product.brand, product.buyer_sku_code);
    });
    return { data: products };
}

app.get('/api/price-list', async (req, res) => {
    if (!cache.data) {
        try {
            cache.data = await fetchPriceList();
        } catch (error) {
            console.error('Error fetching price list:', error);
            res.status(500).send('Error fetching price list');
            return;
        }
    }
    res.json(cache.data);
});

app.post('/api/transaction', async (req, res) => {
    const { buyer_sku_code, customer_no, ref_id } = req.body;
    const sign = crypto.createHash('md5').update(username + apiKey + ref_id).digest('hex');
    try {
        const response = await axios.post('https://api.digiflazz.com/v1/transaction', {
            username,
            buyer_sku_code,
            customer_no,
            ref_id,
            sign
        });
        res.json(response.data);
    } catch (error) {
        console.error('Error processing transaction:', error.response ? error.response.data : error.message);
        res.status(500).send('Error processing transaction');
    }
});

app.get('/api/data', (req, res) => {
    const nomorUnik = Date.now().toString();

    const data = {
        nomorUnik
    };

    res.json(data);
});

app.get('/:brand', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/brand.html'));
});

app.get('/api/config', (req, res) => {
    res.json(config);
});


app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT}`);
});