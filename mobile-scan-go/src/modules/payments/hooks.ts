import { useMutation, useQuery } from '@tanstack/react-query'; import { paymentsApi } from './api';
export const useStartMpesa=()=>useMutation({mutationFn:({orderId,phone}:{orderId:string;phone:string})=>paymentsApi.mpesa(orderId,phone)});
export const usePaymentStatus=(paymentId:string,enabled=true)=>useQuery({queryKey:['payments',paymentId],queryFn:()=>paymentsApi.status(paymentId),enabled,refetchInterval:q=>q.state.data?.status==='PENDING'?4000:false});
