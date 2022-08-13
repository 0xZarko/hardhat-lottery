const { network } = require("hardhat")
const { developmentChains } = require("../helper-hardhat-config")

module.exports = async ({ getNamedAccounts, deployments }) => {
    const { deploy, log } = deployments
    const { deployer } = await getNamedAccounts()

    const BASE_FEE = ethers.utils.parseEther("0.25") //This is the minimum LINK fee to pay
    const GAS_PRICE_LINK = 1e9 //This is the LINK per gas that the Chainlink nodes get payed for executing our functions
    const args = [BASE_FEE, GAS_PRICE_LINK]

    if (developmentChains.includes(network.name)) {
        log("Local network detected, deploying mocks...")
        await deploy("VRFCoordinatorV2Mock", {
            contract: "VRFCoordinatorV2Mock",
            from: deployer,
            log: true,
            args: args,
        })
        log("Mocks deployed!")
        log("-------------------------------------------------")
    }
}

module.exports.tags = ["all", "mocks"]
