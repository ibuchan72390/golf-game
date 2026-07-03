terraform {
  required_version = ">= 1.6"
  required_providers {
    supabase = {
      source  = "supabase/supabase"
      version = "~> 1.0"
    }
    auth0 = {
      source  = "auth0/auth0"
      version = "~> 1.0"
    }
  }
}
