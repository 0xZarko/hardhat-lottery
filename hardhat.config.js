require("@nomicfoundation/hardhat-toolbox") //This includes etherscan, gas reporter and solidity coverage
require("hardhat-deploy")
require("hardhat-contract-sizer")
require("dotenv").config()

//This OR syntax is so Hardhat doesn't get mad at us if we don't use Rinkeby and don't define this parameters in the .env
const RINKEBY_RPC_URL = process.env.RINKEBY_RPC_URL || "https://rinkeby/example"
const PRIVATE_KEY_EXPOSED = process.env.PRIVATE_KEY_EXPOSED || "0xkey"
const PRIVATE_KEY_EXPOSED_2 = process.env.PRIVATE_KEY_EXPOSED_2 || "0xkey"
const ETHERSCAN_API = process.env.ETHERSCAN_API || "key"
const COINMARKETCAP_API = process.env.COINMARKETCAP_API || "key"

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
    solidity: "0.8.7",
    defaultNetwork: "hardhat",
    networks: {
        rinkeby: {
            url: RINKEBY_RPC_URL,
            accounts: [PRIVATE_KEY_EXPOSED, PRIVATE_KEY_EXPOSED_2],
            chainId: 4,
            blockConfirmations: 6,
        },
        localhost: {
            url: "http://127.0.0.1:8545/",
            chainId: 31337,
            blockConfirmations: 1,
        },
        hardhat: {
            chainId: 31337,
            blockConfirmations: 1,
        },
    },
    etherscan: {
        apiKey: ETHERSCAN_API,
    },
    gasReporter: {
        enabled: false, //We should set this to false when we are not interested in gas reports
        outputFile: "gas-report.txt",
        noColors: true,
        currency: "USD",
        //coinmarketcap: COINMARKETCAP_API, //We have to comment it so we don't use too much of the API
        token: "ETH", //This is so we can check how much it will cost in another blockchain (for example, in MATIC or FTM)
    },
    namedAccounts: {
        deployer: {
            default: 0,
        },
        player: {
            default: 1,
        },
    },
    mocha: {
        timeout: 300000, //This is to revert the testing Promise after 300s (time depends on testnet)
    },
}
