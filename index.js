const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const WebSocket = require('ws');
const simpleGit = require('simple-git');
const fs = require('fs');
const path = require('path');

const app = express();
const port = 3001;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const wss = new WebSocket.Server({ port: 3002 });

async function cloneOrUpdateRepo(repoUrl, repoDir) {
    const git = simpleGit();
    if (!fs.existsSync(repoDir)) {
        console.log('Cloning repository...');
        await git.clone(repoUrl, repoDir);
    } else {
        console.log('Repository exists. Pulling latest changes...');
        await git.cwd(repoDir).pull('origin', 'main');
    }
}

app.post('/terraform/:command', async (req, res) => {
    const { accessKey, secretKey, my_company_name, company_name  } = req.body;
    const command = req.params.command;

    if (!accessKey || !secretKey || !my_company_name || !company_name ) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    const repoUrl = 'https://github.com/aeonx-aws-automation/terraformgui_2.git';
    const repoDir = path.join(__dirname, 'terraform-repo');

    try {
        await cloneOrUpdateRepo(repoUrl, repoDir);
    } catch (err) {
        console.error('Git error:', err);
        return res.status(500).json({ error: 'Failed to clone or pull repository' });
    }

    let tfVarsContent = `access_key = "${accessKey}"\nsecret_key = "${secretKey}"\nmy_company_name = "${my_company_name}"\ncompany_name = "${company_name}"`;

    fs.writeFileSync(path.join(repoDir, 'terraform.tfvars'), tfVarsContent);

    let terraformCommand = `terraform ${command} -var-file=terraform.tfvars`;
    if (command === 'apply' || command === 'destroy') {
        terraformCommand += ' -auto-approve';
    }

    console.log('Executing Terraform command:', terraformCommand);

    const child = exec(terraformCommand, { cwd: repoDir });

    wss.on('connection', (ws) => {
        ws.on('message', (message) => {
            if (child.stdin.writable) {
                console.log(`Writing to Terraform process: ${message}`);
                child.stdin.write(message + '\n');
            }
        });
    });

    child.stdout.on('data', (data) => {
        wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(data);
            }
        });
    });

    child.stderr.on('data', (data) => {
        wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(data);
            }
        });
    });

    child.on('close', (code) => {
        console.log(`Terraform process exited with code ${code}`);
        res.json({ status: 'done', code });
    });
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
