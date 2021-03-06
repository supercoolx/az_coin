const { ethers, network } = require("hardhat");
const hre = require("hardhat");
const { constants, Contract, Signer, utils } = require("ethers");
const { tokens, timeout, getBlockTime } = require("../utils/utils");

const PERIOD_LENGTH = 86400; // 1 days
const EVENT_START_IN = 3600; // 1 hour
const reinforcement = tokens(20_000);
const marginality = 50000000; // 5%
const pool2 = 5000000;
const pool1 = 5000000;

let TEST_WALLET = [];
TEST_WALLET.push(process.env.TEST_WALLET1);
TEST_WALLET.push(process.env.TEST_WALLET2);
TEST_WALLET.push(process.env.TEST_WALLET3);

async function main() {
  const [deployer] = await ethers.getSigners();
  //let proxyAdmin = await upgrades.admin.getInstance();
  const oracle = deployer;

  let condID = 0;
  let usdt, math, azurobet, lp, core, mathImpl, coreImpl, azurobetImpl, lpImpl;

  console.log("Deployer wallet: ", deployer.address);
  console.log("Deployer balance:", (await deployer.getBalance()).toString());

  const chainId = await hre.network.provider.send("eth_chainId");
  // hardhat => 800
  // kovan => 8000
  // rinkeby => 20000
  const TIME_OUT = chainId == 0x7a69 ? 800 : chainId == 0x2a ? 8000 : 20000;

  // USDT
  {
    const Usdt = await ethers.getContractFactory("TestERC20");
    usdt = await Usdt.deploy();
    await usdt.deployed();
    await timeout(TIME_OUT);
    console.log("usdt deployed to:", usdt.address);
    await usdt.mint(deployer.address, tokens(800_000_000));
    await timeout(TIME_OUT);
  }

  // Math
  {
    const MathContract = await ethers.getContractFactory("Math");
    math = await upgrades.deployProxy(MathContract);
    console.log("Math deployed to:", math.address);
    await timeout(TIME_OUT);
    mathImpl = await upgrades.erc1967.getImplementationAddress(math.address);
    console.log("mathImpl deployed to:", mathImpl);
  }

  // NFT
  {
    const AzuroBet = await ethers.getContractFactory("AzuroBet");
    azurobet = await upgrades.deployProxy(AzuroBet);
    await timeout(TIME_OUT);
    await azurobet.deployed();
    await timeout(TIME_OUT);
    azurobetImpl = await upgrades.erc1967.getImplementationAddress(azurobet.address);
    console.log("azurobetImpl deployed to:", azurobetImpl);
  }

  // LP
  {
    const LP = await ethers.getContractFactory("LP");
    lp = await upgrades.deployProxy(LP, [usdt.address, azurobet.address, PERIOD_LENGTH]);
    await lp.deployed();
    await timeout(TIME_OUT);
    lpImpl = await upgrades.erc1967.getImplementationAddress(lp.address);
    console.log("lpImpl deployed to:", lpImpl);
  }

  // CORE
  {
    const Core = await ethers.getContractFactory("Core");
    core = await upgrades.deployProxy(Core, [reinforcement, oracle.address, marginality, math.address]);
    await core.deployed();
    await timeout(TIME_OUT);
    coreImpl = await upgrades.erc1967.getImplementationAddress(core.address);
    console.log("coreImpl deployed to:", coreImpl);
  }

  // settings
  {
    await core.setLP(lp.address);
    await timeout(TIME_OUT);
    console.log("CORE: LP address set to", await core.lpAddress());

    await lp.changeCore(core.address);
    await timeout(TIME_OUT);
    console.log("LP: core address set to", await lp.core());

    await azurobet.setLP(lp.address);
    await timeout(TIME_OUT);
    console.log("azurobet: LP address set to", await azurobet.lpAddress());

    const approveAmount = tokens(999_999_999);
    await usdt.approve(lp.address, approveAmount);
    await timeout(TIME_OUT);
    console.log("Approve done ", approveAmount.toString());

    const liquidity = tokens(600_000_000);
    await lp.addLiquidity(liquidity, { gasLimit: 300000 });
    await timeout(TIME_OUT);
    console.log("LP tokens supply", (await lp.totalSupply()).toString());

    time = await getBlockTime(ethers);

    for (const iterator of Array(3).keys()) {
      condID++;
      await core
        .connect(oracle)
        .createCondition(
          condID,
          [pool2, pool1],
          [condID, condID + 1],
          time + EVENT_START_IN,
          ethers.utils.formatBytes32String("condition" + condID)
        );
      await timeout(TIME_OUT);
      console.log("condition %s created", condID);
    }

    console.log("NEXT_PUBLIC_CORE = ", core.address);
    console.log("NEXT_PUBLIC_LP = ", lp.address);
    console.log("NEXT_PUBLIC_AZURO_BET = ", azurobet.address);
    console.log("NEXT_PUBLIC_USDT = ", usdt.address);

    for (const iterator of Array(3).keys()) {
      await usdt.transfer(TEST_WALLET[iterator], tokens(10_000_000));
      await timeout(TIME_OUT);
      console.log("10_000_000 usdt sent to %s", TEST_WALLET[iterator]);
    }
  }

  //verification
  if (chainId != 0x7a69) {
    await hre.run("verify:verify", {
      address: azurobetImpl,
      constructorArguments: [],
    });
    await hre.run("verify:verify", {
      address: coreImpl,
      constructorArguments: [],
    });
    await hre.run("verify:verify", {
      address: lpImpl,
      constructorArguments: [],
    });
    await hre.run("verify:verify", {
      address: mathImpl,
      constructorArguments: [],
    });
    await hre.run("verify:verify", {
      address: usdt.address,
      constructorArguments: [],
    });
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
