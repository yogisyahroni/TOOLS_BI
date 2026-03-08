import fetch from 'node-fetch';

async function testCreateChart() {
    const url = 'http://localhost:8080/api/v1/charts';

    // Note: we might get 401 Unauthorized if auth is required, 
    // so we might need a fake token or to temporarily bypass it.
    // I will test it first without token, and if 401, we know it's reachable.
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                title: "Test Chart",
                datasetId: "00000000-0000-0000-0000-000000000000",
                type: "bar",
                xAxis: "Category",
                yAxis: "Amount"
            })
        });

        console.log("Status:", res.status);
        const text = await res.text();
        console.log("Body:", text);
    } catch (error) {
        console.error("Error:", error);
    }
}

testCreateChart();
