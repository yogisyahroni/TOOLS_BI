import fs from 'fs';

async function run() {
    const loginRes = await fetch("http://localhost:8080/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "admin@datalens.com", password: "admin" })
    });
    const loginData = await loginRes.json();
    const token = loginData.access_token;
    console.log("Logged in");

    const formData = new FormData();
    fs.writeFileSync("test.csv", "col1,col2\n1,2\n3,4");
    const blob = new Blob([fs.readFileSync("test.csv")], { type: 'text/csv' });
    formData.append("file", blob, "test.csv");
    formData.append("name", "Test Save Output");

    const res = await fetch("http://localhost:8080/api/v1/datasets/upload", {
        method: "POST",
        headers: { "Authorization": "Bearer " + token },
        body: formData
    });

    console.log("Status:", res.status);
    console.log(await res.text());
}

run().catch(console.error);
