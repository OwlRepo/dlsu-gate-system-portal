"use client";
import React, { useState } from "react";
import { Logo } from "../logo";
import { useAuth } from "@/lib/auth-context";
import { Input } from "../ui/input";
import { useToast } from "@/hooks/use-toast";
// import { Loader2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Loader2, Eye, EyeOff } from "lucide-react"

const LoginPage = () => {
  // const pathname = usePathname();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [role, setRole] = useState("admin") // Default role
  const [showPassword, setShowPassword] = useState(false)

  const { login } = useAuth();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Check if username, password, and role are provided
    if (!username || !password || !role) {
      setError("Please enter username, password, and select a role.");
      return;
    }

    setLoading(true);

    try {
      const res = await login(username, password, role);
      if (res) {
        setLoading(false);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "An unexpected error occurred";
      toast({
        title: "Error",
        description: message,
        variant: "destructive",
        duration: 3000,
      });
      setLoading(false);
    }

    setError("");
  };

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword)
  }

  const isButtonDisabled = !username || !password || !role;

  return (
    <div className="flex min-h-screen">
      <div className="flex flex-col justify-between items-center w-[50%] p-8">
      <div className="my-auto w-full max-w-md">
        <h1 className="text-xl font-bold text-[#00bc65] mb-2">Sign-in to your account</h1>
        <p className="text-sm text-gray-500">Ready to dive in? Just sign in to continue where you left off.</p>

        {error && <p className="text-red-500 mt-2">{error}</p>}

        <div className="mt-6 w-full">
          <Tabs defaultValue="admin" value={role} onValueChange={setRole} className="w-full">
            <TabsList className="grid grid-cols-2 w-full bg-[#00bc65]">
              <TabsTrigger value="admin" className="data-[state=active]:bg-white data-[state=active]:text-[#00bc65] text-white">
                Administrator
              </TabsTrigger>
              <TabsTrigger value="employee" className="data-[state=active]:bg-white data-[state=active]:text-[#00bc65] text-white">
                Operator
              </TabsTrigger>
            </TabsList>

            <TabsContent value="admin" className="mt-4">
              <LoginForm
                username={username}
                setUsername={setUsername}
                password={password}
                setPassword={setPassword}
                handleSubmit={handleSubmit}
                loading={loading}
                isButtonDisabled={isButtonDisabled}
                showPassword={showPassword}
                togglePasswordVisibility={togglePasswordVisibility}
                label="Employee ID"
              />
            </TabsContent>

            <TabsContent value="employee" className="mt-4">
              <LoginForm
                username={username}
                setUsername={setUsername}
                password={password}
                setPassword={setPassword}
                handleSubmit={handleSubmit}
                loading={loading}
                isButtonDisabled={isButtonDisabled}
                showPassword={showPassword}
                togglePasswordVisibility={togglePasswordVisibility}
                label="Employee ID"
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Footer Section */}
      <footer className="mt-4 text-center text-xs text-gray-500">
        <p>Powered by ELID Technology Intl., Inc.</p>
        <p>Version 1.0.1</p>
      </footer>
    </div>
      {/* Right Side: Background Image */}
      <div className="relative w-[50%] h-[95vh] bg-[#02a65b] rounded-xl my-auto mr-6">
        <div
          style={{
            backgroundImage: "url(/image-pattern.png)", // Adjust the path as needed
            // backgroundSize: 'cover',
            // backgroundPosition: 'center',
            opacity: 0.05, // Adjust opacity to make the image less noticeable
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 0,
          }}
        />
        <div className="relative z-10 flex flex-col items-center justify-center h-full">
          <Logo />
        </div>
      </div>
    </div>
  );
};

export default LoginPage;


interface LoginFormProps {
  username: string
  setUsername: (value: string) => void
  password: string
  setPassword: (value: string) => void
  handleSubmit: (e: React.FormEvent) => void
  loading: boolean
  isButtonDisabled: boolean
  showPassword: boolean
  togglePasswordVisibility: () => void
  label: string
}

function LoginForm({
  username,
  setUsername,
  password,
  setPassword,
  handleSubmit,
  loading,
  isButtonDisabled,
  showPassword,
  togglePasswordVisibility,
  label,
}: LoginFormProps) {
  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div>
        <label htmlFor="username" className="block text-sm font-medium text-gray-700">
          {label}
        </label>
        <Input
          id="username"
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          className="mt-1 block w-full border border-gray-300 rounded-md p-2"
          placeholder="Enter your ID"
        />
      </div>
      <div>
        <label htmlFor="password" className="block text-sm font-medium text-gray-700">
          Password
        </label>
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="mt-1 block w-full border border-gray-300 rounded-md p-2 pr-10"
            placeholder="Enter your Password"
          />
          <button
            type="button"
            onClick={togglePasswordVisibility}
            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500"
          >
            {showPassword ? <EyeOff className="h-5 w-5 text-[#00bc65]" /> : <Eye className="h-5 w-5 text-[#00bc65]" />}
          </button>
        </div>
      </div>
      <button
        type="submit"
        className="w-full bg-[#00bc65] text-white py-3 rounded-md flex items-center justify-center"
        disabled={isButtonDisabled}
      >
        {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Sign In"}
      </button>
    </form>
  )
}


{/* <div className="flex flex-col justify-between items-center w-[50%] p-8">

<div className="my-auto">
  <h1 className="text-xl font-bold text-[#00bc65] mb-2">
    Sign-in to your {userType} account
  </h1>
  <p className="text-sm text-gray-500">
    Ready to dive in? Just sign in to continue where you left off.
  </p>
  {error && <p className="text-red-500">{error}</p>}
  <form className="space-y-4 mt-4" onSubmit={handleSubmit}>
    <div>
      <label
        htmlFor="username"
        className="block text-sm font-medium text-gray-700"
      >
        Username
      </label>
      <Input
        id="username"
        type="text"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        required
        className="mt-1 block w-full border border-gray-300 rounded-md p-2"
      />
    </div>
    <div>
      <label
        htmlFor="password"
        className="block text-sm font-medium text-gray-700"
      >
        Password
      </label>
      <Input
        id="password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        className="mt-1 block w-full border border-gray-300 rounded-md p-2"
      />
    </div>
    <button
      type="submit"
      className="w-full bg-[#00bc65] text-white py-2 rounded-md flex items-center justify-center"
      disabled={isButtonDisabled}
    >
      {loading ? (
        <Loader2 className="h-5 w-5 animate-spin" />
      ) : (
        "Sign in"
      )}
    </button>
    <div className="flex justify-center">
      <Link href={pathname === "/login" ? "/login/employee" : "/login"}>
        <p className="text-[#00bc65] text-sm">
          Login as {pathname === "/login" ? "operator" : "admin"}?
        </p>
      </Link>
    </div>
  </form>
</div>
<footer className="mt-4 text-center text-xs text-gray-500">
  <p>Powered by ELID Technology Intl., Inc.</p>
  <p>Version 1.0.1</p>
</footer>
</div> */}