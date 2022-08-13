//Lottery contract:
//Enter the lottery paying some amount
//Pick a verifiably random winner (Chainlink Oracle, VRF)
//Winner to be selected X minutes (automatic -> Chainlink Keepers)

// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;

/* VRF Imports */
import "@chainlink/contracts/src/v0.8/interfaces/VRFCoordinatorV2Interface.sol";
import "@chainlink/contracts/src/v0.8/VRFConsumerBaseV2.sol";

/* Keepers Imports */
import "@chainlink/contracts/src/v0.8/interfaces/KeeperCompatibleInterface.sol";

error Lottery__NotEnoughEth(); //Custom errors to save gas when reverting
error Lottery__TransferFailed();
error Lottery__NotOpen();
error Lottery__UpkeepNotNeeded(uint256 currentBalance, uint256 numPlayers, uint256 lotteryState);

/** @title A sample lottery contract
 *  @author Zarko
 *  @notice This contract is for creating an untamperable decentralized lottery
 *  @dev This implements Chainlink VRF V2 and Chainlink Keepers
 */
contract Lottery is VRFConsumerBaseV2, KeeperCompatibleInterface {
    /* Types */
    enum LotteryState {
        OPEN,
        CALCULATING
    }
    /* State variables */
    uint256 private immutable i_entranceFee; //We can make this immutable because we only set it in the constructor
    address payable[] private s_players; //We have to make these addresses payable to pay them their lottery winnings
    VRFCoordinatorV2Interface private immutable i_vrfCoordinator; //We have to save the VRF coordinator to call it when needed
    bytes32 private immutable i_gasLane; //This determines the maximum gas price to pay for a VRF request
    uint64 private immutable i_subscriptionId; //This is the ID given to our contract on the Chainlink website
    uint32 private immutable i_callbackGasLimit; //This is the gas limit assigned to fulfillRandomWords
    uint16 private constant REQUEST_CONFIRMATIONS = 3; //This is the number of confirmations to wait before the coordinator delivers the random numbers
    uint32 private constant NUM_WORDS = 1; //This is the amount of random words we are requesting
    uint256 private s_lastTimeStamp; //This is so we have the last timestamp in which the checkUpkeep function was called

    address payable private s_mostRecentWinner; //The lastest winner of the lottery
    LotteryState private s_lotteryState; //The current state of the lottery
    uint256 private immutable i_interval; //The time interval between lottery winner draws
    /* Events */
    event LotteryEntered(address indexed player); //We create a new event to emit when a player enters the lottery
    event RequestedLotteryWinner(uint256 indexed requestId); //event to emit when asking the VRF coordinator for a random number
    event WinnerPicked(address indexed winner); //Event to emit when we pick a winner using the random number

    constructor(
        address vrfCoordinator,
        uint256 entranceFee,
        bytes32 gasLane,
        uint64 subscriptionId,
        uint32 callbackGasLimit,
        uint256 interval
    ) VRFConsumerBaseV2(vrfCoordinator) {
        i_entranceFee = entranceFee;
        i_vrfCoordinator = VRFCoordinatorV2Interface(vrfCoordinator);
        i_gasLane = gasLane;
        i_subscriptionId = subscriptionId;
        i_callbackGasLimit = callbackGasLimit;
        s_lotteryState = LotteryState.OPEN; //We initialize the lottery as open
        s_lastTimeStamp = block.timestamp; //We initialize the timestamp with the deploy block's timestamp
        i_interval = interval;
    }

    function enterLottery() public payable {
        //We have to make this function payable so it can receive eth
        if (s_lotteryState != LotteryState.OPEN) {
            revert Lottery__NotOpen();
        } else if (msg.value < i_entranceFee) {
            //We check if the user has sent enough ETH to enter the lottery
            revert Lottery__NotEnoughEth(); //Reverting with a custom error saves gas
        } else {
            s_players.push(payable(msg.sender)); //We have to make the msg.sender payable to add it to our array
            emit LotteryEntered(msg.sender); //Then we emit the event that says a player entered the lottery
        }
    }

    function checkUpkeep(
        //This is called by the keepers, checking for a "return true" to call performUpkeep
        bytes memory /* checkData */ //this checkData can be anything - even a function to be called everytime the keepers check!
    )
        public
        view
        override
        returns (
            bool upkeepNeeded,
            bytes memory /* performData */ //This is a way to do some extra stuff depending on how the checkUpkeep function ended
        )
    {
        bool isOpen = (s_lotteryState == LotteryState.OPEN); //This syntax is basically an If statement
        bool hasTimePassed = ((block.timestamp - s_lastTimeStamp) > i_interval); //This checks if enough time has passed between lottery draws
        bool hasPlayers = (s_players.length > 1); //This checks if we have at least two players before drawing the lottery winner
        bool hasBalance = (address(this).balance > 0); //This checks to see if the contract has some ETH to give out in the lottery
        upkeepNeeded = (isOpen && hasTimePassed && hasPlayers && hasBalance); //This will automatically get returned
    }

    //The external keyword makes it so it costs less gas because solidity knows it can't be called from the contract
    //function requestRandomWinner() external {
    function performUpkeep(
        bytes calldata /* performData */
    ) external override {
        //Since calldata doesn't work with strings, we have to make the checkUpkeep calldata into memory
        (bool upkeepNeeded, ) = checkUpkeep(""); //Here we validate the upkeepNeeded to make sure this function only executes when
        if (!upkeepNeeded) {
            revert Lottery__UpkeepNotNeeded(
                address(this).balance,
                s_players.length,
                uint256(s_lotteryState)
            );
        }
        s_lotteryState = LotteryState.CALCULATING; //When we want to pick a winner, we close the lottery so we can't get more entries
        uint256 requestId = i_vrfCoordinator.requestRandomWords(
            i_gasLane, // gasLane: maximum price we are willing to pay for a request (in wei)
            i_subscriptionId, //The ID of the contract in the Chainlink subscription page
            REQUEST_CONFIRMATIONS, //How many confirmations before the coordinator sends the random number. More -> more secure
            i_callbackGasLimit, //This sets a limit on how much gas our fulfillRandomWords can spend (protection)
            NUM_WORDS //This is the number of random words to ask the coordinator, in this case we only want one
        );
        emit RequestedLotteryWinner(requestId);
    }

    function fulfillRandomWords(
        uint256, /*requestId*/
        uint256[] memory randomWords
    ) internal override {
        uint256 indexOfWinner = randomWords[0] % s_players.length;
        address payable mostRecentWinner = s_players[indexOfWinner]; //We save it to a intermediate variable so we dont over-read from storage
        s_mostRecentWinner = mostRecentWinner;
        s_players = new address payable[](0); //We also need to reset our players array
        s_lastTimeStamp = block.timestamp; //And reset the last timestamp
        s_lotteryState = LotteryState.OPEN; //After picking and paying the winner, we can open the lottery again
        (bool success, ) = mostRecentWinner.call{value: address(this).balance}(""); //We transfer the balance to the winner
        if (!success) {
            revert Lottery__TransferFailed(); //Revert if the transfer fails
        }
        emit WinnerPicked(mostRecentWinner); //And emit an event with the most recent winner
    }

    /* View/Pure functions */
    function getVrfCoordinator() public view returns (address) {
        return address(i_vrfCoordinator);
    }

    function getEntranceFee() public view returns (uint256) {
        return i_entranceFee;
    }

    function getPlayer(uint256 index) public view returns (address) {
        return s_players[index];
    }

    function getMostRecentWinner() public view returns (address) {
        return s_mostRecentWinner;
    }

    function getLotteryState() public view returns (LotteryState) {
        return s_lotteryState;
    }

    function getNumOfWinners() public pure returns (uint32) {
        //we can use a pure function because constants are in the bytecode, not in storage
        return NUM_WORDS;
    }

    function getNumOfPlayers() public view returns (uint256) {
        return s_players.length;
    }

    function getLastTimestamp() public view returns (uint256) {
        return s_lastTimeStamp;
    }

    function getRequestConfirmations() public pure returns (uint16) {
        return REQUEST_CONFIRMATIONS;
    }

    function getInterval() public view returns (uint256) {
        return i_interval;
    }
}
