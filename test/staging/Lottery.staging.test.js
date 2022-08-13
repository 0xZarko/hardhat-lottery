const { assert, expect } = require("chai")
const { ethers, getNamedAccounts, network } = require("hardhat")
const { developmentChains } = require("../../helper-hardhat-config")

developmentChains.includes(network.name)
    ? describe.skip
    : describe("Lottery", function () {
          let lottery, deployer, player
          const chainId = network.config.chainId
          const entranceFee = networkConfig[chainId]["entranceFee"]

          beforeEach(async function () {
              deployer = (await getNamedAccounts()).deployer
              player = (await getNamedAccounts()).player
              lottery = await ethers.getContract("Lottery", deployer)
              playerLottery = await ethers.getContract("Lottery", player)
          })

          it("Works with live Chainlink Keepers and the Chainlink VRF", async function () {
              const startingTimeStamp = await lottery.getLastTimestamp()

              //We want to setup the listener even before entering the lottery, just in case the lottery resolves beforehand
              await new Promise(async (resolve, reject) => {
                  lottery.once("WinnerPicked", async () => {
                      try {
                          const numPlayers = await lottery.getNumOfPlayers()
                          assert.equal(numPlayers.toString(), "0")

                          const newTimeStamp = await lottery.getLastTimestamp()
                          assert(newTimeStamp > startingTimeStamp)

                          const lotteryState = await lottery.getLotteryState()
                          assert.equal(lotteryState.toString(), "0")
                          resolve()
                      } catch (error) {
                          reject(error)
                      }
                  })
                  await lottery.enterLottery({ value: entranceFee })
                  await playerLottery.enterLottery({ value: entranceFee })
              })
          })
      })
