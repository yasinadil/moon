"use client";
import { Checkbox } from "@/components/ui/checkbox";
import { VESTING_CLAIM_ABI } from "@/config/ABI/VESTING_CLAIM_ABI";
import { vestingAndClaimAddress } from "@/config/addresses";
import { getClaimStatusForUsers } from "@/server/getClaimStatusForUsers";
import { Check, Clock, User } from "lucide-react";
import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { Address, createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";
import { useWalletClient } from "wagmi";
type Request = {
  id: string;
  user: string;
  access: boolean;
  blockTimestamp: string;
};
type Data = {
  claimAccessRequests: Request[];
};
export default function Admin() {
  const [requests, setRequests] = useState<Request[]>([]);
  const [ownerConnected, setOwnerConnected] = useState(false);
  const [approveMany, setApproveMany] = useState(false);
  const [selectedCards, setSelectedCards] = useState<string[]>([]);

  const walletClient = useWalletClient();
  const publicClient = createPublicClient({
    chain: mainnet,
    transport: http(),
  });

  async function loadRequests() {
    setOwnerConnected(false);
    const owner = await publicClient.readContract({
      address: vestingAndClaimAddress,
      abi: VESTING_CLAIM_ABI,
      functionName: "owner",
    });
    if (
      owner?.toLowerCase() ==
      walletClient?.data?.account?.address?.toLowerCase()
    ) {
      setOwnerConnected(true);
      const data = (await getClaimStatusForUsers()) as Data;
      const requestsData = data?.claimAccessRequests;
      setRequests(requestsData);
    } else {
      setOwnerConnected(false);
    }
  }
  useEffect(() => {
    loadRequests();
  }, [walletClient?.data?.account?.address]);

  const allowAccess = async (user: Address) => {
    if (walletClient?.data) {
      try {
        const { request } = await publicClient.simulateContract({
          account: walletClient?.data?.account,
          address: vestingAndClaimAddress,
          abi: VESTING_CLAIM_ABI,
          functionName: "allowClaim",
          args: [user, true],
        });

        const hash = await walletClient?.data?.writeContract(request);
        const transaction = await publicClient.waitForTransactionReceipt({
          hash,
        });
        if (transaction.status == "success") {
          toast.success("Claim Access has been granted!");
          loadRequests();
        }
      } catch (error) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const err = error as any;
        if (err?.shortMessage) {
          toast.error(err?.shortMessage);
        }
      }
    }
  };

  const allowMultipleAccess = async () => {
    if (selectedCards.length <= 0) {
      toast.error("Select atleast 1 user to give access to!");
    }
    if (walletClient?.data) {
      try {
        const flags = Array(selectedCards.length).fill(true) as boolean[];
        const { request } = await publicClient.simulateContract({
          account: walletClient?.data?.account,
          address: vestingAndClaimAddress,
          abi: VESTING_CLAIM_ABI,
          functionName: "allowMultipleClaim",
          args: [selectedCards as `0x${string}`[], flags],
        });

        const hash = await walletClient?.data?.writeContract(request);
        const transaction = await publicClient.waitForTransactionReceipt({
          hash,
        });
        if (transaction.status == "success") {
          toast.success("Claim Access has been granted!");
          loadRequests();
        }
      } catch (error) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const err = error as any;
        if (err?.shortMessage) {
          toast.error(err?.shortMessage);
        }
      }
    }
  };

  const handleCheckboxChange = (card: Request, checked: boolean) => {
    if (checked) {
      setSelectedCards((prev) => [...prev, card.user]);
    } else {
      setSelectedCards((prev) => prev.filter((c) => c !== card.user));
    }
  };

  return (
    <div className="text-white">
      <div className="flex justify-between items-center px-4 pb-4 mt-4 ">
        <h1 className="text-2xl ">CLAIM ACCESS REQUESTS</h1>
        {ownerConnected && requests.length > 1 && (
          <div className="flex items-center gap-x-4">
            <button
              onClick={() => setApproveMany(!approveMany)}
              className={`flex items-center gap-x-2 p-2 border border-neutral-600 rounded-xl ${
                approveMany ? "bg-green-400/50" : "bg-transparent"
              }`}
            >
              Allow Multiple <Check />
            </button>

            <button
              onClick={allowMultipleAccess}
              className={`flex items-center gap-x-2 p-2 border border-neutral-600 rounded-xl `}
            >
              Give Access <Check />
            </button>
          </div>
        )}
      </div>

      {ownerConnected ? (
        <div className="px-4">
          <div className="text-white grid grid-cols-4 gap-4 ">
            {requests?.map((request, index) => {
              const date = new Date(Number(request.blockTimestamp) * 1000);
              return (
                <div
                  className="grid p-2 border border-neutral-400 rounded-xl gap-1"
                  key={index}
                >
                  <div className="flex items-center gap-x-2">
                    <User className="w-4 h-4" /> {request.user}
                  </div>

                  <div className="flex items-center gap-x-2">
                    <Clock className="w-4 h-4" /> {date.toLocaleString()}
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      Access:
                      <span className="text-red-500 ml-2">
                        {String(request.access)}
                      </span>
                    </div>

                    {!approveMany ? (
                      <div>
                        <button
                          onClick={() => allowAccess(request.user as Address)}
                          className="text-sm text-neutral-200 px-2 py-1 bg-black/60 border border-white/40 rounded-xl"
                        >
                          Allow Access
                        </button>
                      </div>
                    ) : (
                      <Checkbox
                        onCheckedChange={(state) =>
                          handleCheckboxChange(request, !!state)
                        }
                        id="terms"
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="px-4">Owner Wallet is required for this task!</div>
      )}
    </div>
  );
}
