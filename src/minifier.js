// const VisualMachine = require('scratch-vm')
const parser = require('scratch-parser')
const JSZip = require('jszip')
const minilog = require('minilog')
minilog.disable() // Clean the vm's output

function parseProject (file) {
    return new Promise((resolve, reject) => {
        parser(file, false, (err, proj) => {
            if (err) reject(err)
            else resolve(proj)
        })
    })
}

function * genMessNames () {
    let chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
    let messed = ''
    while (chars.length !== 0) {
        const choosed = chars[Math.floor(Math.random() * (chars.length - 1))]
        chars = chars.replace(choosed, '')
        messed += choosed
    }
    const messlength = messed.length
    let count = 0
    while (true) {
        let tmp = count
        let out = ''
        while (tmp > 0) {
            const rest = tmp % messlength
            tmp -= rest
            out += messed[rest]
            tmp /= messlength
        }
        if (out === '') out = messed[0]
        yield out
        count++
    }
}

/**
 * Minify a project, return the buffer of the minifyed project.
 * @param {Buffer|ArrayBuffer} projectFile Project Buffer to load.
 * @returns {Promise<Buffer|ArrayBuffer>} The minifyed project.
 */
async function minify (projectFile) {
    const zipfile = JSZip.loadAsync(projectFile)
    let project, files
    try {
        [project, files] = await parseProject(projectFile)
    } catch (err) {
        throw new Error('Not a vaild Scratch 3.0 project.')
    }
    if (project.projectVersion !== 3) {
        throw new Error('Only support Scratch 3.0 project.')
    }
    // console.log(project)
    // TODO: Mess Scratch 2.0 project
    const MessTargetNameMaping = new Map()
    const MessConstantNameMaping = new Map()
    const TargetNameIndex = new Map()
    const SensingOfBlocks = []
    const MessVariableNameMaping = {}
    const MessListNameMaping = {}
    const messFunc = genMessNames()
    const zip = await zipfile
    let stageName = 'Stage'
    // const project = JSON.parse(await zip.file('project.json').async('string'))
    let counter = 0
    for (const target of project.targets) {
        if (target.isStage) {
            MessTargetNameMaping.set(target.name, target.name)
            stageName = target.name
        } else {
            MessTargetNameMaping.set(target.name, messFunc.next().value)
        }
        TargetNameIndex.set(target.name, counter)
        MessVariableNameMaping[target.name] = new Map()
        MessListNameMaping[target.name] = new Map()
        const MessProccodeNameMaping = new Map()
        const ProcCallIds = new Set()
        counter++
        for (const key in target.variables) {
            const variable = target.variables[key]
            MessVariableNameMaping[target.name].set(variable[0], messFunc.next().value)
            // console.log(`Renamed ${variable[0]} to ${MessVariableNameMaping[target.name].get(variable[0])}`)
            variable[0] = MessVariableNameMaping[target.name].get(variable[0])
        }
        for (const key in target.lists) {
            const list = target.lists[key]
            MessListNameMaping[target.name].set(list[0], messFunc.next().value)
            // console.log(`Renamed ${variable[0]} to ${MessVariableNameMaping[target.name].get(variable[0])}`)
            list[0] = MessListNameMaping[target.name].get(list[0])
        }
        for (const id in target.blocks) {
            const block = target.blocks[id]
            if (block.inputs) {
                let i = 0
                for (const key in block.inputs) {
                    i++
                }
                if (i > 0) {
                    // console.log(block.inputs)
                }
            }
            if (block.opcode === 'sensing_of') { // Non-hat and independent block.
                switch (block.fields.PROPERTY[0]) {
                case 'background #':
                case 'backdrop #':
                case 'backdrop name':
                case 'volume':
                case 'x position':
                case 'y position':
                case 'direction':
                case 'costume #':
                case 'costume name':
                case 'size':
                    break
                default:
                {
                    const menu = target.blocks[block.inputs.OBJECT[1]]
                    SensingOfBlocks.push([block, menu]) // We can mess it after these loop, not now.
                }
                }
                console.log(block)
            }
            if (block.opcode && (block.opcode.startsWith('event_') ||
            block.opcode === 'procedures_definition' ||
            block.opcode === 'procedures_call' ||
            block.opcode === 'procedures_prototype' ||
            block.opcode === 'control_start_as_clone')) {
                if (block.opcode === 'procedures_prototype') {
                    const proccode = block.mutation.proccode
                    const proccodeSpilted = proccode.split(/\s+/)
                    const newProccode = []
                    proccodeSpilted.forEach(v => {
                        if (v.replace(/%\S/, '') === '') newProccode.push(v)
                    })
                    block.mutation.proccode = messFunc.next().value + ' ' + newProccode.join(' ')
                    MessProccodeNameMaping.set(proccode, block.mutation.proccode)
                }
                if (block.opcode === 'procedures_call') {
                    ProcCallIds.add(id)
                }
                if (!block.shadow && block.topLevel) {
                    block.x = block.y = 0
                }
                if (block.topLevel) {
                    block.shadow = true
                }
            } else if (block.topLevel || // Non-hat and independent block.
                block instanceof Array) { // Independent variable block.
                target.blocks[id] = undefined
            }
        }
        ProcCallIds.forEach(id => {
            const block = target.blocks[id]
            block.mutation.proccode = MessProccodeNameMaping.get(block.mutation.proccode)
        })
    }
    for (const [block, menu] of SensingOfBlocks) {
        const obj = menu.fields.OBJECT[0]
        const valName = block.fields.PROPERTY[0]
        if (obj === '_stage_') {
            block.fields.PROPERTY[0] = MessVariableNameMaping[stageName].get(valName)
        } else {
            block.fields.PROPERTY[0] = MessVariableNameMaping[obj].get(valName)
        }
    }
    zip.file('project.json', JSON.stringify(project))
    return zip.generateAsync({
        type: 'nodebuffer',
        mimeType: 'application/x.scratch.sb3',
        compression: 'DEFLATE',
        compressionOptions: { level: 9 }
    })
}

module.exports = minify
