import { IsOptional, IsString, IsUUID, MinLength } from "class-validator";

export class CreateAccountDto {
  @IsUUID()
  customerId!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() password?: string;
  @IsOptional() @IsString() wifiCode?: string;
  @IsOptional() @IsString() notes?: string;

  @IsOptional() @IsString() kitNumber?: string;
  @IsOptional() @IsString() serialNumber?: string;
  @IsOptional() @IsString() accountNumber?: string;
  @IsOptional() @IsString() subscriptionId?: string;
  @IsOptional() @IsString() starlinkId?: string;
  @IsOptional() @IsString() deviceName?: string;
}

export class UpdateAccountDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() password?: string;
  @IsOptional() @IsString() wifiCode?: string;
  @IsOptional() @IsString() notes?: string;

  @IsOptional() @IsString() kitNumber?: string;
  @IsOptional() @IsString() serialNumber?: string;
  @IsOptional() @IsString() accountNumber?: string;
  @IsOptional() @IsString() subscriptionId?: string;
  @IsOptional() @IsString() starlinkId?: string;
  @IsOptional() @IsString() deviceName?: string;
}
