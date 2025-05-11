const http = require('http');

const hostname = '192.168.1.1';
const path = '/prelogin_status_web_app.cgi';

const options = {
    hostname,
    path,
    method: 'GET',
};

const req = http.request(options, res => {
    let data = '';

    res.on('data', chunk => {
        data += chunk;
    });

    res.on('end', () => {
        try {
            const json = JSON.parse(data);

            // WAN IP Status
            console.log('== WAN IP Status ==');
            if (json.wan_ip_status && json.wan_ip_status.length > 0) {
                const wan = json.wan_ip_status[0];
                console.log(`WAN Up: ${wan.gwwanup}`);
                console.log(`External IPv4: ${wan.ExternalIPAddress}`);
                console.log(`External IPv6: ${wan.ExternalIPv6Address}`);
            } else {
                console.log('No WAN IP status found.');
            }

            // 5G Cell Stats
            console.log('\n== 5G Cell Stats ==');
            if (json.cell_5G_stats_cfg && json.cell_5G_stats_cfg.length > 0) {
                const stat = json.cell_5G_stats_cfg[0].stat;
                console.log(`RSRP: ${stat.RSRPCurrent}`);
                console.log(`RSRQ: ${stat.RSRQCurrent}`);
                console.log(`SNR: ${stat.SNRCurrent}`);
                console.log(`Signal Strength Level: ${stat.SignalStrengthLevel}`);
            } else {
                console.log('No 5G stats available.');
            }

            // LTE Cell Stats
            console.log('\n== LTE Cell Stats ==');
            if (json.cell_LTE_stats_cfg && json.cell_LTE_stats_cfg.length > 0) {
                const stat = json.cell_LTE_stats_cfg[0].stat;
                console.log(`RSRP: ${stat.RSRPCurrent}`);
                console.log(`RSRQ: ${stat.RSRQCurrent}`);
                console.log(`RSSI: ${stat.RSSICurrent}`);
                console.log(`SNR: ${stat.SNRCurrent}`);
                console.log(`Signal Strength Level: ${stat.SignalStrengthLevel}`);
            } else {
                console.log('No LTE stats available.');
            }
        } catch (err) {
            console.error('Failed to parse response:', err);
        }
    });
});

req.on('error', err => {
    console.error('Request failed:', err);
});

req.end();

