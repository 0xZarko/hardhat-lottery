const { run } = require("hardhat")

async function verify(contractAddress, args) {
    console.log("Verifying contract...")
    try {
        //We add the try-catch block to catch errors (like an already verified contract)
        await run("verify:verify", {
            //We run the verify task (and the verify subtask)
            address: contractAddress, //We give the task the contract address
            constructorArguments: args, //And its constructor arguments so it can correctly verify it
        })
    } catch (e) {
        //We catch any errors the previous function can return
        if (e.message.toLowerCase().includes("already verified")) {
            //for example an already verified contract
            console.log("Already verified!")
        } else {
            console.log(e)
        }
    }
}

module.exports = { verify }
