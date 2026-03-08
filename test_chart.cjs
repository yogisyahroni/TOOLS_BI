const http = require('http');

async function testCreateChart() {
    const email = "test" + Date.now() + "@datalens.com";
    const registerData = JSON.stringify({ email: email, password: "password123", displayName: "Test User" });

    const registerOptions = {
        hostname: 'localhost',
        port: 8080,
        path: '/api/v1/auth/register',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(registerData)
        }
    };

    const req = http.request(registerOptions, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
            const resp = JSON.parse(data);
            const token = resp.accessToken;

            if (!token) {
                console.error("Register failed:", data);
                return;
            }

            console.log("Registered using token", token);

            const chartData = JSON.stringify({
                title: "Test Chart",
                datasetId: "00000000-0000-0000-0000-000000000000",
                type: "bar",
                xAxis: "Category",
                yAxis: "Amount"
            });

            const chartOptions = {
                hostname: 'localhost',
                port: 8080,
                path: '/api/v1/charts',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + token,
                    'Content-Length': Buffer.byteLength(chartData)
                }
            };

            const chartReq = http.request(chartOptions, (cres) => {
                let cdata = '';
                cres.on('data', chunk => cdata += chunk);
                cres.on('end', () => console.log("Chart Response:", cres.statusCode, cdata));
            });
            chartReq.on('error', e => console.error(e));
            chartReq.write(chartData);
            chartReq.end();
        });
    });

    req.on('error', e => console.error(e));
    req.write(registerData);
    req.end();
}

testCreateChart();
