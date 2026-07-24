const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');
const scriptMatches = html.match(/<script>(.*?)<\/script>/gs);
if (scriptMatches) {
    scriptMatches.forEach((s, i) => {
        let code = s.replace(/<script>/, '').replace(/<\/script>/, '');
        try {
            new Function(code);
            console.log("Script " + i + " syntax OK");
        } catch (e) {
            console.error("Syntax Error in script " + i + ":", e.message);
        }
    });
}
