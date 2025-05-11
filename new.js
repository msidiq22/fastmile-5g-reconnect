#!/usr/bin/env node

const http = require('http');
const sjcl = require('sjcl');
const CryptoJS = require('crypto-js');

function sha256(val1, val2) {
    const out = sjcl.hash.sha256.hash(`${val1}:${val2}`);
    return sjcl.codec.base64.fromBits(out);
}

function sha256url(val1, val2) {
    return base64url_escape(sha256(val1, val2));
}

function base64url_escape(b64) {
    let out = '';
    for (let i = 0; i < b64.length; i++) {
        const c = b64.charAt(i);
        if (c === '+') out += '-';
        else if (c === '/') out += '_';
        else if (c === '=') out += '.';
        else out += c;
    }
    return out;
}

function getResult(options, result, resolve, reject) {
    let rawData = '';
    result.on('data', chunk => rawData += chunk);
    result.on('end', () => resolve(rawData));
    result.on('error', error => reject(error));
}

function getNonce(hostname) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname,
            path: '/login_web_app.cgi?nonce',
            method: 'GET',
        };
        const req = http.request(options, result => getResult(options, result, resolve, reject));
        req.on('error', reject);
        req.end();
    });
}

function salt(hostname, username, nonceResponse) {
    return new Promise((resolve, reject) => {
        const nonceUrl = base64url_escape(nonceResponse.nonce);
        const userHash = sha256url(username, nonceResponse.nonce);
        const postBody = `userhash=${userHash}&nonce=${nonceUrl}`;
        const options = {
            hostname,
            path: '/login_web_app.cgi?salt',
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(postBody),
            },
        };
        const req = http.request(options, result => getResult(options, result, resolve, reject));
        req.on('error', reject);
        req.write(postBody);
        req.end();
    });
}

function login(hostname, username, password, nonceResponse, saltResponse) {
    return new Promise((resolve, reject) => {
        const nonceUrl = base64url_escape(nonceResponse.nonce);
        const userhash = sha256url(username, nonceResponse.nonce);
        const randomKeyHash = sha256url(nonceResponse.randomKey, nonceResponse.nonce);
        let hashedPassword = nonceResponse.iterations >= 1
            ? CryptoJS.SHA256(saltResponse.alati + password).toString()
            : saltResponse.alati + password;

        for (let i = 1; i < nonceResponse.iterations; i++) {
            const thisPass = CryptoJS.enc.Hex.parse(hashedPassword);
            hashedPassword = CryptoJS.SHA256(thisPass).toString();
        }

        const response = sha256url(sha256(username, hashedPassword.toLowerCase()), nonceResponse.nonce);
        let postBody = `userhash=${userhash}&RandomKeyhash=${randomKeyHash}&response=${response}&nonce=${nonceUrl}`;
        const enckey = sjcl.codec.base64.fromBits(sjcl.random.randomWords(4, 0));
        const enciv = sjcl.codec.base64.fromBits(sjcl.random.randomWords(4, 0));
        postBody += `&enckey=${base64url_escape(enckey)}&enciv=${base64url_escape(enciv)}`;

        const options = {
            hostname,
            path: '/login_web_app.cgi?salt',
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(postBody),
            },
        };
        const req = http.request(options, result => getResult(options, result, resolve, reject));
        req.on('error', reject);
        req.write(postBody);
        req.end();
    });
}

function ifdown(hostname, loginResponse) {
    return new Promise((resolve, reject) => {
        const apnPayload = JSON.stringify({
            version: 1,
            csrf_token: loginResponse.token,
            id: 1,
            interface: "Nokia.GenericService",
            service: "OAM",
            function: "ModifyAPN",
            paralist: [{
                WorkMode: "RouteMode",
                AccessPointName: "internet",
                Services: "TR069",
                VOIP: null,
                INTERNET: false,
                IPTV: false,
                UserName: "",
                Password: "",
                confirmPwd: null,
                AuthenticationMode: "None",
                IPv4: true,
                IPv6: true,
                IPv4NetMask: "",
                MTUSize: "",
                APNInstanceID: 1,
                ipMode: 3,
                mtuMode: "Automatic",
                EthernetInterface: "",
                VLANID: 0
            }]
        });

        const options = {
            hostname,
            path: '/service_function_web_app.cgi',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(apnPayload),
                Cookie: `sid=${loginResponse.sid}`,
            },
        };

        const req = http.request(options, result => getResult(options, result, resolve, reject));
        req.on('error', reject);
        req.write(apnPayload);
        req.end();
    });
}

function ifup(hostname, loginResponse) {
    return new Promise((resolve, reject) => {
        const apnPayload = JSON.stringify({
            version: 1,
            csrf_token: loginResponse.token,
            id: 1,
            interface: "Nokia.GenericService",
            service: "OAM",
            function: "ModifyAPN",
            paralist: [{
                WorkMode: "RouteMode",
                AccessPointName: "internet",
                Services: "TR069,INTERNET",
                VOIP: null,
                INTERNET: true,
                IPTV: false,
                UserName: "",
                Password: "",
                confirmPwd: null,
                AuthenticationMode: "None",
                IPv4: true,
                IPv6: true,
                IPv4NetMask: "",
                MTUSize: "",
                APNInstanceID: 1,
                ipMode: 3,
                mtuMode: "Automatic",
                EthernetInterface: "",
                VLANID: 0
            }]
        });

        const options = {
            hostname,
            path: '/service_function_web_app.cgi',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(apnPayload),
                Cookie: `sid=${loginResponse.sid}`,
            },
        };

        const req = http.request(options, result => getResult(options, result, resolve, reject));
        req.on('error', reject);
        req.write(apnPayload);
        req.end();
    });
}

// CLI Argument Handling
if (process.argv.length !== 5) {
    console.log("Incorrect arguments, usage: node login.js <hostname> <username> <password>");
    process.exit(1);
}

const [,, hostname, username, password] = process.argv;

let nonceResponse = '';
let saltResponse = '';
let loginResponse = '';

getNonce(hostname)
    .then(response => {
        nonceResponse = JSON.parse(response);
        return salt(hostname, username, nonceResponse);
    })
    .then(response => {
        saltResponse = JSON.parse(response);
        return login(hostname, username, password, nonceResponse, saltResponse);
    })
    .then(response => {
        loginResponse = JSON.parse(response);
        return ifdown(hostname, loginResponse);
    })
    .then(response => {
        console.log("Interface down.");
        return new Promise(resolve => setTimeout(resolve, 30000));
    })
    .then(() => {
        return ifup(hostname, loginResponse);
    })
    .then(response => {
        console.log("Interface up.");
        console.log("Reconnect successful. Response:");
        console.log(response);
    })
    .catch(error => {
        console.error("Error:", error);
    });

