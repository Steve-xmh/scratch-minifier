const minifier = require('./minifier')
const { promises:{readFile, writeFile} } = require('fs')

function log (...args) { console.log(...args) }
function error (...args) { console.error('Error:', ...args) }

if (process.argv.length < 3) {
    log('ScratchMinifier')
    log('    by SteveXMH')
    log('Usage: scratch-minifier (project file) (output file)')
    process.exit(0)
}

const inputFile = process.argv[process.argv.length - 2]
const outputFile = process.argv[process.argv.length - 1]

if (!inputFile || !outputFile) {
    error('No input file or output file.')
    process.exit(0)
}

async function main () {
    await writeFile(outputFile, await minifier(await readFile(inputFile)))
} main()
