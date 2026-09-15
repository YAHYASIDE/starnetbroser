import { IsEmail, IsOptional, IsString, MinLength } from "class-validator";

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(10, { message: "Password must be at least 10 characters" })
  password!: string;

  @IsOptional()
  @IsString()
  deviceName?: string;
}
