const { assert, expect } = require("chai")
const { deployments, ethers, getNamedAccounts, network } = require("hardhat")
const { developmentChains, networkConfig } = require("../../helper-hardhat-config")

!developmentChains.includes(network.name)
    ? describe.skip
    : describe("Lottery", function () {
          let lottery, vrfCoordinator, deployer, player
          const chainId = network.config.chainId
          const entranceFee = networkConfig[chainId]["entranceFee"]
          const interval = networkConfig[chainId]["interval"]

          beforeEach(async function () {
              deployer = (await getNamedAccounts()).deployer
              player = (await getNamedAccounts()).player
              await deployments.fixture(["all"])
              lottery = await ethers.getContract("Lottery", deployer)
              playerLottery = await ethers.getContract("Lottery", player)
              vrfCoordinator = await ethers.getContract("VRFCoordinatorV2Mock", deployer)
          })

          describe("constructor", function () {
              it("Initializes the raffle correctly", async function () {
                  const lotteryState = await lottery.getLotteryState()
                  assert.equal(lotteryState, "0") //0 is the OPEN state

                  const settedEntranceFee = await lottery.getEntranceFee()
                  assert.equal(settedEntranceFee.toString(), entranceFee.toString())

                  const interval = await lottery.getInterval()
                  assert.equal(interval.toString(), interval.toString())
              })
          })

          describe("enterLottery", function () {
              it("Reverts when you don't send enough ETH", async function () {
                  await expect(lottery.enterLottery(/*no value*/)).to.be.revertedWithCustomError(
                      lottery,
                      "Lottery__NotEnoughEth"
                  )
              })

              it("Adds players when they enter correctly", async function () {
                  await lottery.enterLottery({ value: entranceFee })
                  const player = await lottery.getPlayer(0)
                  assert.equal(player, deployer)
              })

              it("Emits the LotteryEntered event when a user enters the lottery with the user's address", async function () {
                  await expect(lottery.enterLottery({ value: entranceFee }))
                      .to.emit(lottery, "LotteryEntered")
                      .withArgs(deployer)
              })

              it("Reverts when trying to enter the lottery if it's calculating the winner", async function () {
                  //We have to make it so the lottery state is CALCULATING, so we have to manipulate its variables (time, players, balance)
                  //By entering with deployer and player, we give the lottery enough balance and players
                  await lottery.enterLottery({ value: entranceFee })
                  await playerLottery.enterLottery({ value: entranceFee })
                  //We then advance time in the blockchain so the required interval has passed
                  await network.provider.send("evm_increaseTime", [Number(interval) + 1]) //Increases our local blockchain time
                  await network.provider.send("evm_mine", []) //And mines a block so we can detect the time
                  //Now, checkUpkeed should return true, so we can call performUpkeep to change the lottery state to CALCULATING
                  await lottery.performUpkeep([]) //We have to pass it an empty calldata
                  await expect(
                      lottery.enterLottery({ value: entranceFee })
                  ).to.be.revertedWithCustomError(lottery, "Lottery__NotOpen")
              })
          })

          describe("checkUpkeep", function () {
              it("Returns false if no people have entered the lottery", async function () {
                  //Since we are checking only the players part, we should make sure everything else is true (isOpen is already true)
                  //We make hasTimePassed true:
                  await network.provider.send("evm_increaseTime", [Number(interval) + 1])
                  await network.provider.send("evm_mine", [])

                  const { upkeepNeeded } = await lottery.callStatic.checkUpkeep([])
                  assert(!upkeepNeeded) //It should return false
              })
              it("Returns false if the lottery isn't open", async function () {
                  //We get the lottery into the CALCULATING state
                  await lottery.enterLottery({ value: entranceFee })
                  await playerLottery.enterLottery({ value: entranceFee })
                  await network.provider.send("evm_increaseTime", [Number(interval) + 1])
                  await network.provider.send("evm_mine", [])
                  await lottery.performUpkeep("0x")
                  const lotteryState = await lottery.getLotteryState()
                  assert.equal(lotteryState, "1")
                  //And we see what checkUpkeep returns
                  const { upkeepNeeded } = await lottery.callStatic.checkUpkeep([])
                  assert(!upkeepNeeded)
              })
              it("Returns false if it hasn't passed enough time", async function () {
                  await lottery.enterLottery({ value: entranceFee })
                  await playerLottery.enterLottery({ value: entranceFee })
                  await network.provider.send("evm_increaseTime", [Number(interval) - 10])
                  await network.provider.send("evm_mine", [])

                  const { upkeepNeeded } = await lottery.callStatic.checkUpkeep([])
                  assert(!upkeepNeeded) //It should return false
              })
              it("Returns true if the lottery is open, has players, balance and enough time has passed", async function () {
                  await lottery.enterLottery({ value: entranceFee })
                  await playerLottery.enterLottery({ value: entranceFee })
                  await network.provider.send("evm_increaseTime", [Number(interval) + 1])
                  await network.provider.send("evm_mine", [])

                  const { upkeepNeeded } = await lottery.callStatic.checkUpkeep([])
                  assert(upkeepNeeded)
              })
          })

          describe("performUpkeep", function () {
              it("Reverts if checkUpkeep is false", async function () {
                  const { upkeepNeeded } = await lottery.callStatic.checkUpkeep([])
                  assert(!upkeepNeeded)

                  await expect(lottery.performUpkeep([]))
                      .to.be.revertedWithCustomError(lottery, "Lottery__UpkeepNotNeeded")
                      .withArgs(
                          await lottery.provider.getBalance(lottery.address),
                          await lottery.getNumOfPlayers(),
                          await lottery.getLotteryState()
                      )
              })
              it("Can only run when checkUpkeep is true", async function () {
                  await lottery.enterLottery({ value: entranceFee })
                  await playerLottery.enterLottery({ value: entranceFee })
                  await network.provider.send("evm_increaseTime", [Number(interval) + 1])
                  await network.provider.send("evm_mine", [])

                  const { upkeepNeeded } = await lottery.callStatic.checkUpkeep([])
                  assert(upkeepNeeded)

                  const transactionResponse = await lottery.performUpkeep([])
                  assert(transactionResponse)
              })
              it("Changes the lottery state to CALCULATING", async function () {
                  await lottery.enterLottery({ value: entranceFee })
                  await playerLottery.enterLottery({ value: entranceFee })
                  await network.provider.send("evm_increaseTime", [Number(interval) + 1])
                  await network.provider.send("evm_mine", [])
                  await lottery.performUpkeep([])
                  assert.equal(await lottery.getLotteryState(), "1")
              })
              it("Calls the VRF Coordinator", async function () {
                  await lottery.enterLottery({ value: entranceFee })
                  await playerLottery.enterLottery({ value: entranceFee })
                  await network.provider.send("evm_increaseTime", [Number(interval) + 1])
                  await network.provider.send("evm_mine", [])
                  const transactionResponse = await lottery.performUpkeep([])
                  const transactionReceipt = await transactionResponse.wait(1)
                  const requestId = transactionReceipt.events[1].args.requestId //It has the index 1 because the VRF Coordinator also emits an event
                  assert(requestId > 0)
              })
              it("Emits the RequestedLotteryWinner event", async function () {
                  await lottery.enterLottery({ value: entranceFee })
                  await playerLottery.enterLottery({ value: entranceFee })
                  await network.provider.send("evm_increaseTime", [Number(interval) + 1])
                  await network.provider.send("evm_mine", [])
                  await expect(lottery.performUpkeep([])).to.emit(lottery, "RequestedLotteryWinner")
              })
          })

          describe("fulfillRandomWords", function () {
              beforeEach(async function () {
                  await lottery.enterLottery({ value: entranceFee })
                  await network.provider.send("evm_increaseTime", [Number(interval) + 1])
                  await network.provider.send("evm_mine", [])
              })
              it("Can only be called if there has been a request for a random word", async function () {
                  //We are using a revert inside the VRFCoordinatorV2Mock contract to check this
                  await expect(
                      vrfCoordinator.fulfillRandomWords(0, lottery.address) //Since we haven't made a request, it should revert
                  ).to.be.revertedWith("nonexistent request")
                  await expect(
                      vrfCoordinator.fulfillRandomWords(1, lottery.address)
                  ).to.be.revertedWith("nonexistent request")
              })
              it("Picks the winner, resets the lottery, sends the money and emits an event with the winner", async function () {
                  const accounts = await ethers.getSigners()
                  const additionalEntrants = 3
                  const startingAccountIndex = 1 // Since the index 0 corresponds to the deployer
                  for (
                      let i = startingAccountIndex;
                      i < startingAccountIndex + additionalEntrants;
                      i++
                  ) {
                      const accountConnectedLottery = lottery.connect(accounts[i])
                      await accountConnectedLottery.enterLottery({ value: entranceFee })
                  }
                  const startingTimeStamp = await lottery.getLastTimestamp()

                  //Since we have to wait until the event WinnerPicked is emmited before we can test anything, we wait with a Promise
                  await new Promise(async (resolve, reject) => {
                      //We set up the listener first so we don't miss the event
                      lottery.once("WinnerPicked", async () => {
                          try {
                              //This was only to check who was the winner
                              //const recentWinner = await lottery.getMostRecentWinner()
                              //console.log(`The most recent winner is ${recentWinner}!`)
                              //console.log("The participants were:")
                              //console.log(accounts[0].address)
                              //console.log(accounts[1].address) WINNER!!!!
                              //console.log(accounts[2].address)
                              //console.log(accounts[3].address)

                              const currentWinnerBalance = await accounts[1].getBalance()
                              assert.equal(
                                  currentWinnerBalance.toString(),
                                  initialWinnerBalance.add(
                                      //The winner's balance should've increased by (4 * entranceFee)
                                      entranceFee //entranceFee
                                          .mul(additionalEntrants) // * 3 = (3 * entranceFee)
                                          .add(entranceFee) // + entranceFee = (4 * entranceFee)
                                          .toString()
                                  )
                              ) //The winner should have been paid

                              const numPlayers = await lottery.getNumOfPlayers()
                              assert.equal(numPlayers.toString(), "0") //The players should have resetted

                              const newTimeStamp = await lottery.getLastTimestamp()
                              assert(newTimeStamp > startingTimeStamp) //Time should have passed

                              const lotteryState = await lottery.getLotteryState()
                              assert.equal(lotteryState.toString(), "0") //The lottery should be OPEN
                          } catch (error) {
                              reject(error) //If there's an issue or a timeout we reject the Promise
                          }
                          resolve() //Otherwise, we resolve
                      })
                      const initialWinnerBalance = await accounts[1].getBalance() //Since we know who the winner is, we get his balance before the lottery starts
                      //We still have to get the event to be emmited, so we have to call performUpkeep and fulfillRandomWords
                      const transactionResponse = await lottery.performUpkeep([])
                      const transactionReceipt = await transactionResponse.wait(1) //With the TX receipt we can get the requestId from the event emmited
                      await vrfCoordinator.fulfillRandomWords(
                          //This will also execute the lottery.fulfillRandomWords with some randomWords
                          transactionReceipt.events[1].args.requestId,
                          lottery.address
                      ) //The fulfillRandomWords should fire the WinnerPicked event when it's done, executing the "try" part of the promise
                  })
              })
          })
      })
