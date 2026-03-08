import fs from 'fs';

async function run() {
    const formData = new FormData();
    fs.writeFileSync("test.csv", "col1,col2\n1,2\n3,4");
    const blob = new Blob([fs.readFileSync("test.csv")], { type: 'text/csv' });
    formData.append("file", blob, "test.csv");
    formData.append("name", "Test Save Output");

    const res = await fetch("http://localhost:8080/api/v1/datasets/upload", {
        method: "POST",
        body: formData
    });

    console.log("Status:", res.status);
    console.log(await res.text());
}

run().catch(console.error);
