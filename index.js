// Fungsi untuk menghitung signature
function generateSignature(username, apiKey) {
    const crypto = require('crypto');
    return crypto.createHash('md5').update(username + apiKey + 'pricelist').digest('hex');
}

// Konfigurasi
const username = 'vimiheDaA0GD'; // Ganti dengan username Anda
const apiKey = 'dev-d6f11b80-98b5-11ee-8c83-97c87b67c067';     // Ganti dengan API Key Anda
const cmd = 'prepaid';              // atau 'pasca'

// Membuat payload untuk request
const payload = {
    cmd: cmd,
    username: username,
    sign: generateSignature(username, apiKey)
};

// Mengirim request ke API
const url = 'https://api.digiflazz.com/v1/price-list';

fetch(url, {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
})
    .then(response => {
        if (!response.ok) {
            throw new Error(`Error: ${response.status} - ${response.statusText}`);
        }
        return response.json();
    })
    .then(data => {
        console.log(JSON.stringify(data, null, 2));
    })
    .catch(error => {
        console.error('Terjadi kesalahan:', error);
    });
