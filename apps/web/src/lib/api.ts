const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000/api";
export const API_ORIGIN = API_URL.replace(/\/api\/?$/, "");

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem("token");
  const headers = new Headers(options.headers);
  if (!(options.body instanceof FormData)) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(`${API_URL}${path}`, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? "Request failed");
  return data as T;
}


export async function apiBlob(path:string):Promise<Blob>{
  const token=localStorage.getItem("token");
  const headers=new Headers();
  if(token)headers.set("Authorization",`Bearer ${token}`);
  const response=await fetch(`${API_URL}${path}`,{headers});
  if(!response.ok){
    const data=await response.json().catch(()=>({}));
    throw new Error(data.error??"Media request failed");
  }
  return response.blob();
}
