
const fs = require('fs');
const crypto = require('crypto');
const { table } = require('console');

const K_JUMP = '跳转';
const K_COND = '条件';
const K_SELS = '选择';
const K_EXPR = '表达式';
const K_LABEL = '标签';
const TXT_FILE = '文件';
const TXT_DIA = '<div class="dia">对话开始</div>';

function escapeHtml(html) {
    return String(html)
        .replace(/&(?!\w+;)/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/'/g, '&#39;')
        .replace(/"/g, '&quot;');
};

function encryptFilename(fullpath) {
    const iSlash = fullpath.lastIndexOf('/');
    const pathMD5 = crypto.createHash('md5').update(fullpath).digest('hex');
    return fullpath.substring(0, iSlash == -1 ? 0 : iSlash + 1) + pathMD5;
}

function encryptScriptName(storage) {
    return encryptFilename('script/' + storage.replace('.ks', '.json'));
}

function fmtAnchorName(storage, target) {
    return `${storage}-${target}`.replace(/\*/g, '.');
}

function fmtLabel(storage, id, title) {
    const text = `(${storage}) ${id}${title && ' ' + title || ''}`;
    return `<a name="${fmtAnchorName(storage, id)}">${text}</a>`;
}

function fmtJump(storage, arg) {
    let { target, storage: targetStorage } = arg;
    if (targetStorage) targetStorage = targetStorage.replace('.ss', '.ks'); // for eternal love
    const textStorage = targetStorage || `(${storage})`;
    const text = `${textStorage} ${target}`;
    return `<a href="#${fmtAnchorName(targetStorage || storage, target)}">${text}</a>`;
}

function fmtChoices(storage, choices) {
    return choices.map(arg => arg.text + fmtJump(storage, arg)).join('<br/>');
}

function fmtVOEncryptedName(vo) {
    return encryptFilename(`se/${vo}.m4a`);
}

function fmtDialogRow(seqnum, arg, text) {
    const { npc, vo } = arg;
    const npcText = npc && `<div class="npc">${npc}</div>` || '';
    const voClick = vo && ` onclick="vo('${fmtVOEncryptedName(vo)}')"` || '';
    const finalText = `<div class="text${vo && ' vo'}" ${voClick}>${text}</div>`;
    return [seqnum, npcText, finalText];
}

function fmtExpression(exp) {
    return `<div class="exp">${escapeHtml(exp)}</div>`;
}

function symmel_scriptToHTML(data, storage) {
    const tableRows = [];
    let dialogArg = {};
    let selChoices = [];
    for (const [opcode, seqnum, subop, arg] of data) switch (opcode) {
        case 0: // def label
            tableRows.push([seqnum, K_LABEL, fmtLabel(storage, arg.id, arg.title)]);
            break;
        case 1: // jmp label
            tableRows.push([seqnum, K_JUMP, fmtJump(storage, arg)]);
            break;
        case 4: switch (arg['']) { // call sub, used for dialogs
            case 'npc': dialogArg.npc = arg.id; break;
            case 'vo': dialogArg.vo = arg.storage; break;
            case 'selstart': selChoices.length = 0; break;
            case 'selbutton': selChoices.push(arg); break;
            case 'selend': tableRows.push([seqnum, K_SELS, fmtChoices(storage, selChoices)]); break;
            case 'dia': tableRows.push([seqnum, '', TXT_DIA]);
        } break;
        case 5: // dialog line
            tableRows.push(fmtDialogRow(seqnum, dialogArg, arg.text));
            dialogArg = {};
            break;
        case 50: // expression
            tableRows.push([seqnum, K_EXPR, fmtExpression(arg.exp)]);
            break;
        case 51: // if blocks
            for (const [cond, subscript] of arg['']) tableRows.push([seqnum, K_COND,
                [fmtExpression(cond), '<br/>', symmel_scriptToHTML(subscript, storage)].join('')
            ]);
            break;
    }
    return ['<table>',
        tableRows.map(row => '<tr><td>' + row.join('</td><td>') + '</td></tr>').join(''),
        '</table>'].join('');
}

function symmel_storageToHTML(storage) {
    const fullpath = encryptScriptName(storage);
    const filedata = fs.readFileSync(fullpath, { encoding: 'utf-8' });
    const data = JSON.parse(filedata);
    return symmel_scriptToHTML(data, storage);
}

function ete_scriptToHTML(data, storage) {
    const tableRows = [];
    let dialogArg = {};
    let selChoices = [];
    for (const [opcode, aObj, ...aArr] of data) switch (opcode) {
        case 0: // label
            tableRows.push(['', K_LABEL, fmtLabel(storage, aArr[0], aObj.title)]);
            break;
        case 8: // dialog line
            tableRows.push(fmtDialogRow(aArr[1], dialogArg, aArr[0]));
            dialogArg = {};
            break;
        case 60: switch (aObj['']) {
            case 'npc': dialogArg.npc = aObj.id; break;
            case 'vo': dialogArg.vo = aObj.storage; break;
            case 'selstart': selChoices.length = 0; break;
            case 'selbutton': selChoices.push(aObj); break;
            case 'selend': tableRows.push(['', K_SELS, fmtChoices(storage, selChoices)]); break;
            case 'showwd': tableRows.push(fmtDialogRow('', dialogArg, aObj.text)); dialogArg = {}; break;
        } break;
        case 63:
            tableRows.push([K_COND, 'IF', fmtExpression(aArr[0])]);
            break;
        case 64:
            tableRows.push([K_COND, 'ELIF', fmtExpression(aArr[0])]);
            break;
        case 65:
            tableRows.push([K_COND, 'ENDIF', '']);
            break;
        case 69:
            tableRows.push(['', K_EXPR, fmtExpression(aArr[0])]);
            break;
        case 201:
            tableRows.push(['', K_JUMP, fmtJump(storage, aObj)]);
            break;
    };
    return ['<table>',
        tableRows.map(row => '<tr><td>' + row.join('</td><td>') + '</td></tr>').join(''),
        '</table>'].join('');
}

function ete_storageToHTML(storage) {
    const fullpath = encryptScriptName(storage);
    const filedata = fs.readFileSync(fullpath);
    const data = JSON.parse(new TextDecoder('utf-16le', { ignoreBOM: false }).decode(filedata));
    return ete_scriptToHTML(data, storage);
}

function createHTML(outfile, gamename, scriptFiles, storageToHTMLFunc) {
    const outputHTML = fs.createWriteStream(outfile, { encoding: 'utf-8' });
    outputHTML.write(`<!DOCTYPE html>
<html>
<meta charset="utf-8">
<style>
    html {
        font-family: 'Sarasa Mono SC', 'Noto Sans Mono CJK SC', monospace;
    }

    #voplayer {
        top: 1em;
        right: 1em;
        position: fixed;
    }

    table {
        margin: 0.25em 0.5em;
        border-collapse: collapse;
    }
    html > table {
        max-width: 75%;
    }

    td {
        padding: 0;
        width: fit-content;
        vertical-align: top;
        border: 1px solid black;
    }

    .cond {
        font-weight: bold;
        color: lightskyblue;
        background-color: black;
    }

    .dia {
        color: #00896C;
        margin-left: 1em;
        font-weight: bold;
    }

    .exp {
        font-weight: bold;
        color: greenyellow;
        background-color: black;
    }

    .jump {
        text-decoration: none;
    }

    .jump,
    .jump:active,
    .jump:visited {
        color: #3f2e32;
        font-weight: bold;
    }

    .label {
        color: #51A8DD;
        font-weight: bold;
    }

    .vo {
        background-color: #F0F0F0;
        padding-left: 1em;
    }

    .vo:hover {
        cursor: pointer;
    }

    td:nth-of-type(2) {
        padding: 0 0.2em;
        text-align: center;
        align-items: center;
        min-width: 2em;
    }

    a[href]::before {
        content: "-> ";
    }
</style>

<title>${gamename}</title>

<body>
    <h1>${gamename}</h1>
    <audio id="voplayer" controls style="display: none;"></audio>`);
    for (const scriptFile of scriptFiles) {
        outputHTML.write(`<div>${TXT_FILE}: ${scriptFile} (${encryptScriptName(scriptFile)})`);
        outputHTML.write(storageToHTMLFunc(scriptFile));
    }
    outputHTML.write(`<script>
        let ao = document.getElementById('voplayer');
        function vo(src) {
            ao.src = src;
            ao.style.display = 'block';
            ao.play();
        }
    </script>
</body>

</html>
`);
    outputHTML.close();
}

module.exports = {
    runForGameSymMel(outfile, gamename, scriptFiles) {
        return createHTML(outfile, gamename, scriptFiles, symmel_storageToHTML);
    },
    runForGameEte(outfile, gamename, scriptFiles) {
        return createHTML(outfile, gamename, scriptFiles, ete_storageToHTML);
    }
};