"use client";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useEffect, useState } from "react";
import { useReadContract, useReadContracts, useWalletClient } from "wagmi";
import { useAccount } from "wagmi";
import {
  Address,
  createPublicClient,
  erc20Abi,
  formatEther,
  http,
  parseEther,
} from "viem";
import {
  newTokenAddress,
  OldTokenAddress,
  vestingAndClaimAddress,
} from "@/config/addresses";
import { numberWithCommas } from "@/utils/numberWithCommas";
import { VESTING_CLAIM_ABI } from "@/config/ABI/VESTING_CLAIM_ABI";
import { StandardMerkleTree } from "@openzeppelin/merkle-tree";
import { tree } from "@/config/tree";
import { mainnet } from "viem/chains";

import { StandardMerkleTreeData } from "@openzeppelin/merkle-tree/dist/standard";
import { toast } from "sonner";

export default function Home() {
  const [inputAmount, setInputAmount] = useState("");
  const [outputAmount, setOutputAmount] = useState("");
  const [claimAmount, setClaimAmount] = useState("");
  const [unlockDate, setUnlockDate] = useState("");
  const [snapshotAmount, setSnapshotAmount] = useState("0");
  const [proof, setProof] = useState<`0x${string}`[]>([]);
  const [loadingStates, setLoadingStates] = useState({
    approval: false,
    deposit: false,
    claim: false,
  });
  const account = useAccount();
  const walletClient = useWalletClient();

  const publicClient = createPublicClient({
    chain: mainnet,
    transport: http(),
  });

  const VestingAndClaimContract = {
    address: vestingAndClaimAddress,
    abi: VESTING_CLAIM_ABI,
  } as const;

  //   useEffect(() => {

  //   })

  const oldTokenBalance = useReadContract({
    abi: erc20Abi,
    address: OldTokenAddress,
    functionName: "balanceOf",
    args: [account?.address as Address],
  });
  const newTokenBalance = useReadContract({
    abi: erc20Abi,
    address: newTokenAddress,
    functionName: "balanceOf",
    args: [account?.address as Address],
  });
  const claimRequestedData = useReadContract({
    abi: VESTING_CLAIM_ABI,
    address: vestingAndClaimAddress,
    functionName: "claimRequested",
    args: [account?.address as Address],
  });

  const result = useReadContracts({
    contracts: [
      {
        ...VestingAndClaimContract,
        functionName: "getBonusMultiplier",
      },
      {
        ...VestingAndClaimContract,
        functionName: "limitPerDay",
      },

      {
        ...VestingAndClaimContract,
        functionName: "claimedToday",
      },
      {
        ...VestingAndClaimContract,
        functionName: "getUserDepositWithBonus",
        args: [account?.address as Address],
      },
      {
        ...VestingAndClaimContract,
        functionName: "userClaimed",
        args: [account?.address as Address],
      },
      {
        ...VestingAndClaimContract,
        functionName: "claimAllowed",
        args: [account?.address as Address],
      },
    ],
  });

  useEffect(() => {
    function loadSnapshotAmount() {
      if (account?.address) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const treeMerkleData = tree as StandardMerkleTreeData<any[]>;
        const treeMerkle = StandardMerkleTree.load(treeMerkleData);
        const entries = treeMerkle.entries();
        for (const [i, v] of entries) {
          if (v[0] === account?.address?.toLowerCase()) {
            // (3)
            const proof = treeMerkle.getProof(i);

            setProof(proof as `0x${string}`[]);
            setSnapshotAmount(formatEther(v[1]));
          }
        }
      }
    }
    loadSnapshotAmount();
  }, [account?.address]);

  useEffect(() => {
    async function loadUnlockDate() {
      const unlockDate = await publicClient.readContract({
        address: vestingAndClaimAddress,
        abi: VESTING_CLAIM_ABI,
        functionName: "globalLock",
      });

      const date = new Date(Number(unlockDate) * 1000);
      const dateISO = date.toLocaleString();
      setUnlockDate(dateISO);
    }
    loadUnlockDate();
  }, []);
  const limitPerDay = (result?.data && result?.data[1]?.result) || BigInt(0);
  const userClaimed = (result?.data && result?.data[4]?.result) || BigInt(0);
  const claimAllowed =
    (result?.data && result?.data[5]?.result && result?.data[5]?.result) ||
    false;
  const userDepositWithBonus =
    (result?.data && result?.data[3]?.result) || BigInt(0);
  const claimedToday = (result?.data && result?.data[2]?.result) || BigInt(0);
  const multiplier = (result.data && result?.data[0]?.result) || BigInt(10000);
  const bonusPerc = multiplier || BigInt(10000);
  const bonusRatio = Number(bonusPerc) / 10000;
  const claimRequested = claimRequestedData.data
    ? claimRequestedData.data
    : false;

  const depositAmountHandler = (value: string) => {
    if (oldTokenBalance?.data) {
      if (Number(value) > Number(formatEther(oldTokenBalance?.data))) {
        setInputAmount(formatEther(oldTokenBalance?.data));
        const newTokenAmount = formatEther(
          (oldTokenBalance?.data * bonusPerc) / BigInt(10000)
        );
        setOutputAmount(newTokenAmount);
      } else {
        setInputAmount(value);
        const newTokenAmount = formatEther(
          (parseEther(value) * bonusPerc) / BigInt(10000)
        );
        setOutputAmount(newTokenAmount);
      }
    }
  };
  const claimAmountHandler = (value: string) => {
    Number(value);
    const leftToBeClaimed =
      Number(formatEther(limitPerDay)) - Number(formatEther(claimedToday));
    if (Number(value) > Number(formatEther(userDepositWithBonus))) {
      setClaimAmount(Number(formatEther(userDepositWithBonus)).toString());
      return;
    }
    if (Number(value) > leftToBeClaimed) {
      setClaimAmount(leftToBeClaimed.toString());
    } else {
      setClaimAmount(value);
    }
  };

  const requestClaimAccess = async () => {
    if (walletClient?.data) {
      try {
        setLoadingStates({ approval: false, deposit: false, claim: true });
        const { request } = await publicClient.simulateContract({
          account: walletClient?.data?.account,
          address: vestingAndClaimAddress,
          abi: VESTING_CLAIM_ABI,
          functionName: "requestClaimAccess",
        });

        const hash = await walletClient?.data?.writeContract(request);
        const transaction = await publicClient.waitForTransactionReceipt({
          hash,
        });
        if (transaction.status == "success") {
          toast.success("Requested Claim Access from admin!");
          claimRequestedData.refetch();
        }
        setLoadingStates({ approval: false, deposit: false, claim: false });
      } catch (error) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const err = error as any;
        if (err?.shortMessage) {
          toast.error(err?.shortMessage);
        }
        setLoadingStates({ approval: false, deposit: false, claim: false });
      }
    }
  };

  const deposit = async () => {
    if (walletClient?.data) {
      try {
        const allowance = await publicClient.readContract({
          address: OldTokenAddress,
          abi: erc20Abi,
          functionName: "allowance",
          args: [account?.address as Address, vestingAndClaimAddress],
        });
        console.log("allowance", allowance);

        if (allowance < parseEther(inputAmount)) {
          setLoadingStates({ deposit: false, claim: false, approval: true });
          const { request } = await publicClient.simulateContract({
            account: walletClient?.data?.account,
            address: OldTokenAddress,
            abi: erc20Abi,
            functionName: "approve",
            args: [
              vestingAndClaimAddress,
              BigInt(
                "115792089237316195423570985008687907853269984665640564039457584007913129639935"
              ),
            ],
          });
          const hash = await walletClient?.data?.writeContract(request);
          const transaction = await publicClient.waitForTransactionReceipt({
            hash,
          });
          if (transaction.status == "success") {
            toast.success("Amount approved!");
          }

          setLoadingStates({ deposit: false, claim: false, approval: false });
        }

        setLoadingStates({ deposit: true, claim: false, approval: false });
        const { request } = await publicClient.simulateContract({
          account: walletClient?.data?.account,
          address: vestingAndClaimAddress,
          abi: VESTING_CLAIM_ABI,
          functionName: "deposit",
          args: [proof, parseEther(inputAmount), parseEther(snapshotAmount)],
        });

        const hash = await walletClient?.data?.writeContract(request);
        const transaction = await publicClient.waitForTransactionReceipt({
          hash,
        });
        if (transaction.status == "success") {
          toast.success("Deposit completed!");
        }

        setLoadingStates({ deposit: false, claim: false, approval: false });
        result.refetch();
        oldTokenBalance.refetch();
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (error) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const err = error as any;
        if (err?.shortMessage) {
          toast.error(err?.shortMessage);
        }
        setLoadingStates({ approval: false, deposit: false, claim: false });
      }
    }
  };

  const claim = async () => {
    if (walletClient?.data) {
      try {
        setLoadingStates({ approval: false, deposit: false, claim: true });
        const { request } = await publicClient.simulateContract({
          account: walletClient?.data?.account,
          address: vestingAndClaimAddress,
          abi: VESTING_CLAIM_ABI,
          functionName: "claim",
          args: [parseEther(claimAmount)],
        });

        const hash = await walletClient?.data?.writeContract(request);
        const transaction = await publicClient.waitForTransactionReceipt({
          hash,
        });
        if (transaction.status == "success") {
          toast.success("Claim successful!");
        }
        setLoadingStates({ approval: false, deposit: false, claim: false });
      } catch (error) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const err = error as any;
        if (err?.shortMessage) {
          toast.error(err?.shortMessage);
        }
        setLoadingStates({ approval: false, deposit: false, claim: false });
      }
      result.refetch();
      oldTokenBalance.refetch();
    }
  };

  return (
    <div className="mt-[30px] xl:-mt-[22px] mb-[20px] flex justify-center">
      <Tabs defaultValue="deposit" className="w-[90%] lg:max-w-[740px]">
        <div className="flex justify-center mb-[30px]">
          <TabsList className="bg-transparent">
            <TabsTrigger
              className="mr-[15px] md:mr-[50px] px-2 bg-transparent font-normal text-white data-[state=active]:border-b-[3px] border-white rounded-none text-[15px] md:text-[20px] data-[state=active]:font-semibold data-[state=active]:text-white data-[state=active]:bg-transparent"
              value="deposit"
            >
              MOON Deposit
            </TabsTrigger>
            <TabsTrigger
              className="bg-transparent px-2 font-normal text-white data-[state=active]:border-b-[3px] border-white rounded-none text-[15px] md:text-[20px] data-[state=active]:font-semibold data-[state=active]:text-white data-[state=active]:bg-transparent"
              value="claim"
            >
              LUCKYMOON Claim
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent className="w-full" value="deposit">
          <div className="bg-[#BBBBBB26] border-2 border-[#7E5EAA66] rounded-2xl backdrop-blur-[5px] py-[15px] px-[20px] md:py-[40px] md:px-[50px]">
            <h1 className="text-center leading-[121%] font-normal text-[28px] md:text-[40px] text-white">
              MOON Token Swap
            </h1>
            <div className="flex justify-center items-center mt-[40px]">
              <div className="border w-full border-[#FFFFFF66]  rounded-2xl bg-transparent px-[15px] pt-[10px] pb-[10px] md:px-[25px] md:pt-[20px] md:pb-[15px] flex justify-between items-center">
                <div className="flex flex-col gap-3">
                  <h1 className="text-[15px] font-bold text-white flex gap-[10px] items-center">
                    <img src="/assets/images/moon.png" /> MOON Token
                  </h1>
                  <h1 className="text-[12px] font-normal text-gray-300">
                    Balance:{" "}
                    {oldTokenBalance?.data &&
                      numberWithCommas(formatEther(oldTokenBalance?.data))}
                  </h1>
                </div>
                <div className="flex items-center gap-x-2 text-white">
                  <input
                    placeholder="0"
                    value={inputAmount}
                    onChange={(event) =>
                      depositAmountHandler(event.target.value)
                    }
                    type="number"
                    className="text-end placeholder:text-end placeholder:text-white text-[15px] md:text-[20px] font-bold w-[85px] h-[25px] text-white bg-transparent"
                  />
                  <div className="text-[15px] md:text-[20px] font-bold text-white">
                    MOON
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-center items-center mt-3 position-relative relative">
              <img
                src="/assets/images/arrow-down.png"
                className="absolute -top-6 left-1/2 -translate-x-1/2 transform"
              />
              <div className="border w-full border-[#FFFFFF66]  rounded-2xl bg-transparent px-[15px] pt-[10px] pb-[10px] md:px-[25px] md:pt-[20px] md:pb-[15px] flex justify-between items-center">
                <div className="flex flex-col gap-3">
                  <h1 className="text-[15px] font-bold text-white flex gap-[7px] items-center">
                    <img src="/assets/images/lucky-moon.png" /> Lucky Moon Token
                  </h1>
                  <h1 className="text-[12px] font-normal text-gray-300">
                    Balance:{" "}
                    {newTokenBalance?.data &&
                      numberWithCommas(formatEther(newTokenBalance?.data))}
                  </h1>
                </div>
                <div className="flex items-center gap-x-2 text-white">
                  <input
                    value={outputAmount}
                    readOnly
                    type="number"
                    className="text-end placeholder:text-end placeholder:text-white text-[15px] md:text-[20px] font-bold w-[85px] h-[25px] text-white bg-transparent"
                  />
                  <div className="text-[15px] md:text-[20px] font-bold text-white">
                    LUCKYMOON
                  </div>
                </div>
              </div>
            </div>

            {loadingStates?.approval ? (
              <div className="flex items-center justify-between text-neutral-200 text-sm pl-2">
                <div className="underline">Approving</div>
                <svg
                  className="mr-3 -ml-1 size-5 animate-spin text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    stroke-width="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
              </div>
            ) : loadingStates.deposit ? (
              <div className="flex items-center justify-between text-neutral-200 text-sm pl-2">
                <div className="underline">Depositing</div>
                <svg
                  className="mr-3 -ml-1 size-5 animate-spin text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    stroke-width="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
              </div>
            ) : null}

            <div className="flex justify-center items-center my-[25px]">
              <button
                disabled={
                  loadingStates.approval ||
                  loadingStates.deposit ||
                  inputAmount == "" ||
                  Number(inputAmount) <= 0
                }
                onClick={deposit}
                className="backdrop-filter-[10px]  enabled:bg-[linear-gradient(90deg,_rgba(139,113,177,0.75)_0%,_rgba(48,52,97,0.75)_100%)] font-medium text-[15px] md:text-[20px] text-white w-[291px] disabled:text-neutral-600 border border-[#7E5EAA99] hover:bg-neutral-800 rounded-full px-4 py-[11px]"
              >
                Swap
              </button>
            </div>

            <div className="border border-[#FFFFFF66] px-[25px] mb-[20px] rounded-2xl">
              <div className="flex justify-between items-center text-white pt-[16px] pb-[11px]">
                <div className="font-light text-[15px] ">Unlock Date</div>
                <div className="font-semibold text-[15px]">{unlockDate}</div>
              </div>
              <hr className="border-[#FFFFFF66]" />

              <div className="flex justify-between items-center text-white pt-[13px] pb-[11px]">
                <div className="font-light text-[15px] ">
                  MOON Deposited (+ Bonus)
                </div>
                <div className="font-semibold text-[15px]">
                  {numberWithCommas(formatEther(userDepositWithBonus))}
                </div>
              </div>
              <hr className="border-[#FFFFFF66]" />

              <div className="flex justify-between items-center text-white pt-[13px] pb-[11px]">
                <div className="font-light text-[15px] ">
                  Total Claimable LUCKYMOON
                </div>
                <div className="font-semibold text-[15px]">
                  {numberWithCommas(snapshotAmount)}
                </div>
              </div>
              <hr className="border-[#FFFFFF66]" />

              <div className="flex justify-between items-center text-white pt-[13px] pb-[16px]">
                <div className="font-light text-[15px] ">Bonus Ratio</div>
                <div className="font-semibold text-[15px]">1:{bonusRatio}</div>
              </div>
            </div>

            <Alert className="text-white w-full md:w-[74%] mx-[auto] rounded-2xl bg-[#FFFFFF1A] border-[#FFFFFF66] border px-[22px] py-[16px]">
              <Info className="stroke-white" />
              <AlertDescription className="font-normal text-[15px]">
                LUCKYMOON Tokens will be automatically vested. Unlock date will
                be announced soon!
              </AlertDescription>
            </Alert>
          </div>
        </TabsContent>
        <TabsContent className="w-full" value="claim">
          <div className="bg-[#BBBBBB26] border-2 border-[#7E5EAA66] rounded-2xl backdrop-blur-[5px] py-[15px] px-[20px] md:py-[40px] md:px-[50px]">
            <h1 className="text-center leading-[121%] font-normal text-[28px] md:text-[40px] text-white">
              Lucky Moon Token Claim
            </h1>
            <div className="flex justify-center items-center mt-[40px]">
              <div className="border w-full border-[#FFFFFF66]  rounded-2xl bg-transparent px-[15px] pt-[10px] pb-[10px] md:px-[25px] md:pt-[20px] md:pb-[15px] flex justify-between items-center">
                <div className="flex flex-col gap-3">
                  <h1 className="text-[15px] font-bold text-white flex gap-[10px] items-center">
                    <img src="/assets/images/lucky-moon.png" /> Lucky Moon Token
                  </h1>

                  <h1 className="text-[12px] font-normal text-gray-300">
                    Balance:{" "}
                    {newTokenBalance?.data &&
                      numberWithCommas(formatEther(newTokenBalance?.data))}
                  </h1>
                </div>
                <div className="flex items-center gap-x-2 text-white">
                  <input
                    disabled={!claimAllowed}
                    placeholder="0"
                    value={claimAmount}
                    onChange={(event) => claimAmountHandler(event.target.value)}
                    type="number"
                    className="disabled:placeholder:text-neutral-500 text-end placeholder:text-end placeholder:text-white text-[15px] md:text-[20px] font-bold w-[85px] h-[25px] text-white bg-transparent"
                  />
                  <div className="text-[15px] md:text-[20px] font-bold text-white">
                    LUCKYMOON
                  </div>
                </div>
              </div>
            </div>
            {loadingStates?.claim ? (
              <div className="flex items-center justify-between text-neutral-200 text-sm pl-2">
                <div className="underline">Claiming</div>
                <svg
                  className="mr-3 -ml-1 size-5 animate-spin text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    stroke-width="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
              </div>
            ) : null}
            <div className="flex justify-center items-center my-[25px]">
              {claimAllowed ? (
                <button
                  disabled={
                    claimAmount == "" ||
                    Number(claimAmount) <= 0 ||
                    loadingStates.claim
                  }
                  onClick={claim}
                  className="backdrop-filter-[10px]  enabled:bg-[linear-gradient(90deg,_rgba(139,113,177,0.75)_0%,_rgba(48,52,97,0.75)_100%)] font-medium text-[15px] md:text-[20px] text-white w-[291px] disabled:text-neutral-600 border border-[#7E5EAA99] hover:bg-neutral-800 rounded-full px-4 py-[11px]"
                >
                  Claim
                </button>
              ) : (
                <button
                  disabled={claimRequested}
                  onClick={requestClaimAccess}
                  className="backdrop-filter-[10px]  enabled:bg-[linear-gradient(90deg,_rgba(139,113,177,0.75)_0%,_rgba(48,52,97,0.75)_100%)] font-medium text-[15px] md:text-[20px] text-white w-[291px] disabled:text-neutral-600 border border-[#7E5EAA99] hover:bg-neutral-800 rounded-full px-4 py-[11px]"
                >
                  {claimRequested
                    ? "Claim Access Requested"
                    : "Request Claim Access"}
                </button>
              )}
            </div>

            {/* <Alert className="bg-neutral-950 text-white">
              <Info className="stroke-yellow-500" />
              <AlertDescription>
                New Moon Tokens will be automatically be vested. Unlock date
                will be announced soon!
              </AlertDescription>
            </Alert> */}
            <div className="border border-[#FFFFFF66] px-[25px] mb-[20px] rounded-2xl">
              <div className="flex justify-between items-center text-white pt-[16px] pb-[11px]">
                <div className="font-light text-[15px] ">Unlock Date</div>
                <div className="font-semibold text-[15px]">{unlockDate}</div>
              </div>
              <hr className="border-[#FFFFFF66]" />

              <div className="flex justify-between items-center text-white pt-[13px] pb-[11px]">
                <div className="font-light text-[15px] ">
                  MOON Deposited (+ Bonus)
                </div>
                <div className="font-semibold text-[15px] ">
                  {numberWithCommas(formatEther(userDepositWithBonus))}
                </div>
              </div>
              <hr className="border-[#FFFFFF66]" />

              <div className="flex justify-between items-center text-white pt-[13px] pb-[11px]">
                <div className="font-light text-[15px] ">LUCKYMOON Claimed</div>
                <div className="font-semibold text-[15px] ">
                  {numberWithCommas(formatEther(userClaimed))}
                </div>
              </div>
              <hr className="border-[#FFFFFF66]" />

              <div className="flex justify-between items-center text-white pt-[13px] pb-[11px]">
                <div className="font-light text-[15px] ">
                  Total Claimable LUCKYMOON
                </div>
                <div className="font-semibold text-[15px] ">
                  {numberWithCommas(snapshotAmount)}
                </div>
              </div>
              <hr className="border-[#FFFFFF66]" />

              <div className="flex justify-between items-center text-white pt-[13px] pb-[11px]">
                <div className="font-light text-[15px] ">
                  LUCKYMOON Daily Claim Limit
                </div>
                <div className="font-semibold text-[15px] ">
                  {numberWithCommas(formatEther(limitPerDay))}
                </div>
              </div>
              <hr className="border-[#FFFFFF66]" />

              <div className="flex justify-between items-center text-white pt-[13px] pb-[16px]">
                <div className="font-light text-[15px] ">
                  LUCKYMOON Claimed Today (Global)
                </div>
                <div className="font-semibold text-[15px] ">
                  {numberWithCommas(formatEther(claimedToday))}
                </div>
              </div>
              {/* <div className="flex justify-between items-center text-white">
                <div>Bonus Ratio</div>
                <div>1 : {bonusRatio}</div>
              </div> */}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
