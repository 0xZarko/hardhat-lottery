const { network, ethers } = require("hardhat")
const { networkConfig, developmentChains } = require("../helper-hardhat-config")
const { verify } = require("../utils/verify")

const VRF_SUBS_FUND_AMOUNT = ethers.utils.parseEther("2")
module.exports = async ({ getNamedAccounts, deployments }) => {
    const { deploy, log } = deployments
    const { deployer } = await getNamedAccounts()
    const chainId = network.config.chainId

    let vrfCoordinator, vrfCoordinatorAddress, subscriptionId
    if (developmentChains.includes(network.name)) {
        vrfCoordinator = await ethers.getContract("VRFCoordinatorV2Mock")
        vrfCoordinatorAddress = vrfCoordinator.address
        const transactionResponse = await vrfCoordinator.createSubscription() //With this mock, we have to create a subscription to use it
        const transactionReceipt = await transactionResponse.wait(1)
        subscriptionId = transactionReceipt.events[0].args.subId //And we get our subscription ID from the first event it emits
        await vrfCoordinator.fundSubscription(subscriptionId, VRF_SUBS_FUND_AMOUNT) //Finally, we fund the subscription. In the case of a local testnet, it uses ether
    } else {
        vrfCoordinatorAddress = networkConfig[chainId]["vrfCoordinator"]
        subscriptionId = networkConfig[chainId]["subscriptionId"] //Instead of doing it programatically, we use the frontend for this one
    }

    const entranceFee = networkConfig[chainId]["entranceFee"]
    const gasLane = networkConfig[chainId]["gasLane"]
    const callbackGasLimit = networkConfig[chainId]["callbackGasLimit"]
    const interval = networkConfig[chainId]["interval"]

    const args = [
        vrfCoordinatorAddress,
        entranceFee,
        gasLane,
        subscriptionId,
        callbackGasLimit,
        interval,
    ]
    const lottery = await deploy("Lottery", {
        from: deployer,
        args: args,
        log: true,
        waitConfirmations: network.config.blockConfirmations || 1,
    })
    log("-------------------------------------------")
    log("Starting contract verification...")
    if (!developmentChains.includes(network.name) && process.env.ETHERSCAN_API_KEY) {
        await verify(lottery.address, args)
    } else {
        //If we are on a local testnet, we have to add the deployed contract as a consumer for the vrf
        await vrfCoordinator.addConsumer(subscriptionId, lottery.address) //And we need to add
    }
    log("-------------------------------------------")
}

module.exports.tags = ["all", "lottery"]
