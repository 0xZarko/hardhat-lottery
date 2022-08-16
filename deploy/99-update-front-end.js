const { ethers, network } = require("hardhat")
const fs = require("fs")

const FRONTEND_ADDRESSES_FILE = "../nextjs-lottery/constants/contractAddresses.json"
const FRONTEND_ABI_FILE = "../nextjs-lottery/constants/contractAbi.json"

module.exports = async function () {
    if (process.env.UPDATE_FRONTEND) {
        //We add a script in our deploy folder to update addresses for the frontend
        console.log("Updating frontend...")
        await updateContractAddresses()
        await updateAbi()
        console.log("Frontend updated!")
    }
}

async function updateContractAddresses() {
    const chainId = network.config.chainId.toString()
    const lottery = await ethers.getContract("Lottery")
    const contractAddresses = JSON.parse(fs.readFileSync(FRONTEND_ADDRESSES_FILE, "utf8"))
    if (chainId in contractAddresses) {
        //If we already have the chain in the addresses file
        if (!contractAddresses[chainId].includes(lottery.address)) {
            //And we don't have the lottery contract (or is doesn't match)
            contractAddresses[chainId].push(lottery.address) //We add it to the file
        }
    } else {
        //If the chain is not on the contract addresses file
        contractAddresses[chainId] = [lottery.address] //We create it as an array with the contract address in it
    }
    fs.writeFileSync(FRONTEND_ADDRESSES_FILE, JSON.stringify(contractAddresses)) //And we overwrite the file with the new contracts
}

async function updateAbi() {
    const lottery = await ethers.getContract("Lottery")
    fs.writeFileSync(FRONTEND_ABI_FILE, lottery.interface.format(ethers.utils.FormatTypes.json))
}

module.exports.tags = ["all", "frontend"]
